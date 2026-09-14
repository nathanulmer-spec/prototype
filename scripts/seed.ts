import { existsSync, unlinkSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { config } from "../src/config.js";

for (const suffix of ["", "-wal", "-shm"]) {
  const path = `${config.dbPath}${suffix}`;
  if (existsSync(path)) unlinkSync(path);
}

const { getDb } = await import("../src/db/client.js");
const { merchantsRepo } = await import("../src/db/repositories/merchants.repo.js");
const { ordersRepo } = await import("../src/db/repositories/orders.repo.js");
const { invoicesRepo } = await import("../src/db/repositories/invoices.repo.js");
const { transactionsRepo } = await import("../src/db/repositories/transactions.repo.js");
const { codChecksRepo } = await import("../src/db/repositories/codChecks.repo.js");
const { fundingBatchesRepo } = await import("../src/db/repositories/fundingBatches.repo.js");
const { returnsRepo } = await import("../src/db/repositories/returns.repo.js");
const { notificationRulesRepo } = await import("../src/db/repositories/notificationRules.repo.js");
const { notificationLogRepo } = await import("../src/db/repositories/notificationLog.repo.js");
const { webhookSubscriptionsRepo } = await import(
  "../src/db/repositories/webhookSubscriptions.repo.js"
);
const { webhookDeliveriesRepo } = await import("../src/db/repositories/webhookDeliveries.repo.js");
const { WEBHOOK_EVENT_TYPES } = await import("../src/webhooks/eventTypes.js");

const db = getDb();

function daysAgoIso(days: number, hour = 10): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

/** Backdates timestamp columns after the fact, since repo methods always stamp "now". */
function backdate(table: string, id: string, fields: Record<string, string>) {
  const columns = Object.keys(fields);
  db.prepare(`UPDATE ${table} SET ${columns.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`).run(
    ...columns.map((c) => fields[c]),
    id,
  );
}

function backfillDeliveredWebhook(input: {
  subscription_id: string;
  merchant_id: string;
  event_type: string;
  payload: unknown;
  at: string;
}) {
  const delivery = webhookDeliveriesRepo.create({
    subscription_id: input.subscription_id,
    merchant_id: input.merchant_id,
    event_type: input.event_type,
    event_id: `evt_seed_${randomBytes(6).toString("hex")}`,
    payload: JSON.stringify(input.payload),
  });
  webhookDeliveriesRepo.recordAttempt(delivery.id, {
    status: "delivered",
    response_status_code: 200,
    response_body_snippet: '{"received":true}',
    next_attempt_at: input.at,
  });
  backdate("webhook_deliveries", delivery.id, { created_at: input.at, last_attempt_at: input.at });
}

// ---------------------------------------------------------------------------
// Merchant + webhook subscription
// ---------------------------------------------------------------------------

const merchant = merchantsRepo.create({
  name: "Fractal Ready Mix & Aggregates",
  legal_name: "Fractal Ready Mix & Aggregates LLC",
  industry: "ready_mix_concrete",
  api_key: process.env.SEED_API_KEY ?? `sk_test_${randomBytes(16).toString("hex")}`,
});

const subscription = webhookSubscriptionsRepo.create({
  merchant_id: merchant.id,
  target_url: "http://localhost:4000/webhook",
  event_types: [...WEBHOOK_EVENT_TYPES],
  signing_secret: `whsec_${randomBytes(24).toString("hex")}`,
});

// ---------------------------------------------------------------------------
// Live demo orders - left in an interactive starting state on purpose, so a
// viewer can run the COD check / dispatch / simulate-payment story
// themselves from the dashboard.
// ---------------------------------------------------------------------------

const codOrderCleared = ordersRepo.create({
  merchant_id: merchant.id,
  external_ca_order_number: "CA-100234",
  customer_name: "Summit Paving Co.",
  customer_id: "cust_summit_paving",
  delivery_address: "800 Quarry Rd",
  material_description: "4000 PSI Ready-Mix Concrete - 8 CY",
  amount_due_cents: 180_000,
  order_type: "cod",
  requested_delivery_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
});

const codOrderLargeFirstTime = ordersRepo.create({
  merchant_id: merchant.id,
  external_ca_order_number: "CA-100235",
  customer_name: "Greenfield Development",
  customer_id: "cust_greenfield_dev",
  delivery_address: "45 New Build Ln",
  material_description: "5000 PSI Ready-Mix Concrete - 20 CY",
  amount_due_cents: 900_000,
  order_type: "cod",
  requested_delivery_at: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
});

const invoiceOrder = ordersRepo.create({
  merchant_id: merchant.id,
  external_ca_order_number: "CA-100236",
  customer_name: "Riverside Builders LLC",
  customer_id: "cust_riverside_builders",
  delivery_address: "1200 Industrial Pkwy",
  material_description: "Crushed Limestone Base - 15 tons",
  amount_due_cents: 65_000,
  order_type: "invoice",
  requested_delivery_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
});

const invoice = invoicesRepo.create({
  merchant_id: merchant.id,
  order_id: invoiceOrder.id,
  invoice_number: "INV-5001",
  amount_due_cents: invoiceOrder.amount_due_cents,
  due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
});

// ---------------------------------------------------------------------------
// Historical background activity - already resolved, so Transactions,
// Reconciliation, Funding, Returns/Chargebacks, Webhook deliveries, and
// Notifications all show real data before anyone clicks anything.
// ---------------------------------------------------------------------------

const FOUR_DAYS_AGO = daysAgoIso(4);
const THREE_DAYS_AGO = daysAgoIso(3);
const TWO_DAYS_AGO = daysAgoIso(2, 9);
const ONE_DAY_AGO = daysAgoIso(1, 14);

// H1: Coastal Concrete Supply - COD, cleared, dispatched, paid by card.
const h1Order = ordersRepo.create({
  merchant_id: merchant.id,
  external_ca_order_number: "CA-099871",
  customer_name: "Coastal Concrete Supply",
  customer_id: "cust_coastal_concrete",
  delivery_address: "310 Harbor Industrial Way",
  material_description: "3500 PSI Ready-Mix Concrete - 10 CY",
  amount_due_cents: 240_000,
  order_type: "cod",
  requested_delivery_at: FOUR_DAYS_AGO,
});
backdate("orders", h1Order.id, { created_at: FOUR_DAYS_AGO, updated_at: FOUR_DAYS_AGO });

const h1Check = codChecksRepo.create({
  merchant_id: merchant.id,
  order_id: h1Order.id,
  payment_method: "card",
  risk_status: "cleared",
  reason: "payment method verified",
  ttlMs: 24 * 60 * 60 * 1000,
});
backdate("cod_checks", h1Check.id, { checked_at: FOUR_DAYS_AGO, created_at: FOUR_DAYS_AGO });
ordersRepo.updateStatus(merchant.id, h1Order.id, "dispatched");
backdate("orders", h1Order.id, { updated_at: FOUR_DAYS_AGO });

const h1Txn = transactionsRepo.create({
  merchant_id: merchant.id,
  order_id: h1Order.id,
  amount_cents: h1Order.amount_due_cents,
  payment_method: "card",
});
transactionsRepo.updateStatus(merchant.id, h1Txn.id, "succeeded", {
  processor_reference: `sim_${randomBytes(8).toString("hex")}`,
});
backdate("transactions", h1Txn.id, { created_at: FOUR_DAYS_AGO, updated_at: FOUR_DAYS_AGO });

// H2: Ironclad Contractors - COD, cleared, dispatched, paid by ACH.
const h2Order = ordersRepo.create({
  merchant_id: merchant.id,
  external_ca_order_number: "CA-099872",
  customer_name: "Ironclad Contractors",
  customer_id: "cust_ironclad_contractors",
  delivery_address: "77 Foundry Rd",
  material_description: "Pea Gravel - 12 tons",
  amount_due_cents: 360_000,
  order_type: "cod",
  requested_delivery_at: FOUR_DAYS_AGO,
});
backdate("orders", h2Order.id, { created_at: FOUR_DAYS_AGO, updated_at: FOUR_DAYS_AGO });

const h2Check = codChecksRepo.create({
  merchant_id: merchant.id,
  order_id: h2Order.id,
  payment_method: "ach",
  risk_status: "cleared",
  reason: "payment method verified",
  ttlMs: 24 * 60 * 60 * 1000,
});
backdate("cod_checks", h2Check.id, { checked_at: FOUR_DAYS_AGO, created_at: FOUR_DAYS_AGO });
ordersRepo.updateStatus(merchant.id, h2Order.id, "dispatched");
backdate("orders", h2Order.id, { updated_at: FOUR_DAYS_AGO });

const h2Txn = transactionsRepo.create({
  merchant_id: merchant.id,
  order_id: h2Order.id,
  amount_cents: h2Order.amount_due_cents,
  payment_method: "ach",
});
transactionsRepo.updateStatus(merchant.id, h2Txn.id, "succeeded", {
  processor_reference: `sim_${randomBytes(8).toString("hex")}`,
});
backdate("transactions", h2Txn.id, { created_at: FOUR_DAYS_AGO, updated_at: FOUR_DAYS_AGO });

// H4: Ironclad Contractors again - COD, paid by card, then charged back two
// days later (this is created before H3 so it lands in the same funding
// batch as H1/H2, ahead of the invoice-terms history below).
const h4Order = ordersRepo.create({
  merchant_id: merchant.id,
  external_ca_order_number: "CA-099874",
  customer_name: "Ironclad Contractors",
  customer_id: "cust_ironclad_contractors",
  delivery_address: "77 Foundry Rd",
  material_description: "5000 PSI Ready-Mix Concrete - 6 CY",
  amount_due_cents: 120_000,
  order_type: "cod",
  requested_delivery_at: FOUR_DAYS_AGO,
});
backdate("orders", h4Order.id, { created_at: FOUR_DAYS_AGO, updated_at: FOUR_DAYS_AGO });
ordersRepo.updateStatus(merchant.id, h4Order.id, "dispatched");
backdate("orders", h4Order.id, { updated_at: FOUR_DAYS_AGO });

const h4Txn = transactionsRepo.create({
  merchant_id: merchant.id,
  order_id: h4Order.id,
  amount_cents: h4Order.amount_due_cents,
  payment_method: "card",
});
transactionsRepo.updateStatus(merchant.id, h4Txn.id, "succeeded", {
  processor_reference: `sim_${randomBytes(8).toString("hex")}`,
});
backdate("transactions", h4Txn.id, { created_at: FOUR_DAYS_AGO, updated_at: FOUR_DAYS_AGO });

// Nightly funding batch covering H1 + H2 + H4, deposited three days ago.
const historicalBatchTxns = [h1Txn, h2Txn, h4Txn];
const cardTotal = 240_000 + 120_000;
const achTotal = 360_000;
const feeBps = 29;
const feeTotal = Math.round(((cardTotal + achTotal) * feeBps) / 10_000);

const historicalBatch = fundingBatchesRepo.create({
  merchant_id: merchant.id,
  batch_date: THREE_DAYS_AGO.slice(0, 10),
  card_total_cents: cardTotal,
  ach_total_cents: achTotal,
  fee_total_cents: feeTotal,
});
for (const txn of historicalBatchTxns) {
  transactionsRepo.assignFundingBatch(merchant.id, txn.id, historicalBatch.id);
}
fundingBatchesRepo.markDeposited(merchant.id, historicalBatch.id);
backdate("funding_batches", historicalBatch.id, {
  created_at: THREE_DAYS_AGO,
  deposited_at: THREE_DAYS_AGO,
});

// H3: Coastal Concrete Supply again - invoice terms, paid and reconciled.
const h3Order = ordersRepo.create({
  merchant_id: merchant.id,
  external_ca_order_number: "CA-099873",
  customer_name: "Coastal Concrete Supply",
  customer_id: "cust_coastal_concrete",
  delivery_address: "310 Harbor Industrial Way",
  material_description: "Crushed Limestone Base - 15 tons",
  amount_due_cents: 98_000,
  order_type: "invoice",
  requested_delivery_at: TWO_DAYS_AGO,
});
backdate("orders", h3Order.id, { created_at: TWO_DAYS_AGO, updated_at: TWO_DAYS_AGO });

const h3Invoice = invoicesRepo.create({
  merchant_id: merchant.id,
  order_id: h3Order.id,
  invoice_number: "INV-4998",
  amount_due_cents: h3Order.amount_due_cents,
  due_date: daysAgoIso(-26),
});
backdate("invoices", h3Invoice.id, { created_at: TWO_DAYS_AGO, updated_at: TWO_DAYS_AGO });

const h3Txn = transactionsRepo.create({
  merchant_id: merchant.id,
  order_id: h3Order.id,
  invoice_id: h3Invoice.id,
  amount_cents: h3Order.amount_due_cents,
  payment_method: "ach",
});
transactionsRepo.updateStatus(merchant.id, h3Txn.id, "succeeded", {
  processor_reference: `sim_${randomBytes(8).toString("hex")}`,
});
backdate("transactions", h3Txn.id, { created_at: ONE_DAY_AGO, updated_at: ONE_DAY_AGO });

invoicesRepo.applyPayment(merchant.id, h3Invoice.id, h3Txn.amount_cents, h3Txn.id);
ordersRepo.updateStatus(merchant.id, h3Order.id, "paid");
backdate("invoices", h3Invoice.id, { reconciled_at: ONE_DAY_AGO, updated_at: ONE_DAY_AGO });
backdate("orders", h3Order.id, { updated_at: ONE_DAY_AGO });

// H4's chargeback - discovered two days after the original card payment.
const h4Return = returnsRepo.create({
  merchant_id: merchant.id,
  transaction_id: h4Txn.id,
  amount_cents: h4Txn.amount_cents,
  reason: "cardholder_dispute",
});
transactionsRepo.updateStatus(merchant.id, h4Txn.id, "returned", {
  failure_reason: "cardholder_dispute",
});
backdate("returns", h4Return.id, { returned_at: ONE_DAY_AGO, created_at: ONE_DAY_AGO });
backdate("transactions", h4Txn.id, { updated_at: ONE_DAY_AGO });

// A standing customer notification, plus one already-sent log entry.
const notificationRule = notificationRulesRepo.create({
  merchant_id: merchant.id,
  customer_id: "cust_coastal_concrete",
  customer_name: "Coastal Concrete Supply",
  channel: "email",
  destination: "billing@coastalconcrete.example.com",
  event_type: "payment.succeeded",
});
backdate("notification_rules", notificationRule.id, { created_at: FOUR_DAYS_AGO });

const notificationMessage = `Payment of $${(h1Txn.amount_cents / 100).toFixed(2)} (card) received for your order (3500 PSI Ready-Mix Concrete - 10 CY). Thank you!`;
const notificationEntry = notificationLogRepo.create({
  merchant_id: merchant.id,
  rule_id: notificationRule.id,
  event_type: "payment.succeeded",
  channel: "email",
  destination: notificationRule.destination,
  message: notificationMessage,
});
backdate("notification_log", notificationEntry.id, { created_at: FOUR_DAYS_AGO });

// Backfilled webhook deliveries so the log isn't empty on first look either.
backfillDeliveredWebhook({
  subscription_id: subscription.id,
  merchant_id: merchant.id,
  event_type: "order.created",
  payload: { id: h1Order.id, customer_name: h1Order.customer_name },
  at: FOUR_DAYS_AGO,
});
backfillDeliveredWebhook({
  subscription_id: subscription.id,
  merchant_id: merchant.id,
  event_type: "payment.succeeded",
  payload: { id: h1Txn.id, amount_cents: h1Txn.amount_cents, payment_method: "card" },
  at: FOUR_DAYS_AGO,
});
backfillDeliveredWebhook({
  subscription_id: subscription.id,
  merchant_id: merchant.id,
  event_type: "payment.succeeded",
  payload: { id: h2Txn.id, amount_cents: h2Txn.amount_cents, payment_method: "ach" },
  at: FOUR_DAYS_AGO,
});
backfillDeliveredWebhook({
  subscription_id: subscription.id,
  merchant_id: merchant.id,
  event_type: "funding.batch.deposited",
  payload: { id: historicalBatch.id, net_deposit_cents: cardTotal + achTotal - feeTotal },
  at: THREE_DAYS_AGO,
});
backfillDeliveredWebhook({
  subscription_id: subscription.id,
  merchant_id: merchant.id,
  event_type: "invoice.reconciled",
  payload: { id: h3Invoice.id, order_id: h3Order.id },
  at: ONE_DAY_AGO,
});
backfillDeliveredWebhook({
  subscription_id: subscription.id,
  merchant_id: merchant.id,
  event_type: "payment.returned",
  payload: { id: h4Txn.id, return_id: h4Return.id, return_reason: "cardholder_dispute" },
  at: ONE_DAY_AGO,
});

// ---------------------------------------------------------------------------

console.log("\nSeed complete.\n");
console.log("Merchant:");
console.log(`  id:       ${merchant.id}`);
console.log(`  name:     ${merchant.name}`);
console.log(`  api_key:  ${merchant.api_key}`);
console.log("\nWebhook subscription:");
console.log(`  id:              ${subscription.id}`);
console.log(`  target_url:      ${subscription.target_url}`);
console.log(`  signing_secret:  ${subscription.signing_secret}`);
console.log("\nLive demo orders (interact with these from the dashboard):");
console.log(`  cod_cleared candidate:   ${codOrderCleared.id} (${codOrderCleared.customer_name}, $${codOrderCleared.amount_due_cents / 100})`);
console.log(`  cod_hold candidate:      ${codOrderLargeFirstTime.id} (${codOrderLargeFirstTime.customer_name}, $${codOrderLargeFirstTime.amount_due_cents / 100}, no payment history)`);
console.log(`  invoice order + invoice: ${invoiceOrder.id} / ${invoice.id}`);
console.log("\nBackfilled history (already resolved, visible without clicking anything):");
console.log(`  ${h1Order.customer_name}: $${h1Order.amount_due_cents / 100} card, dispatched + paid`);
console.log(`  ${h2Order.customer_name}: $${h2Order.amount_due_cents / 100} ach, dispatched + paid`);
console.log(`  ${h3Order.customer_name}: $${h3Order.amount_due_cents / 100} invoice, reconciled`);
console.log(`  ${h4Order.customer_name}: $${h4Order.amount_due_cents / 100} card, paid then charged back`);
console.log(`  funding batch ${historicalBatch.id}: deposited $${(cardTotal + achTotal - feeTotal) / 100}`);
console.log(`  notification rule for ${notificationRule.customer_name}, 1 already sent`);
console.log("\nRun `npm run webhook-receiver` in one terminal and `npm run dev` in another, then `npm run demo`.\n");
