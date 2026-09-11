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
const { webhookSubscriptionsRepo } = await import(
  "../src/db/repositories/webhookSubscriptions.repo.js"
);
const { WEBHOOK_EVENT_TYPES } = await import("../src/webhooks/eventTypes.js");

getDb();

const merchant = merchantsRepo.create({
  name: "Riverside Ready Mix",
  legal_name: "Riverside Ready Mix LLC",
  industry: "ready_mix_concrete",
  api_key: process.env.SEED_API_KEY ?? `sk_test_${randomBytes(16).toString("hex")}`,
});

const subscription = webhookSubscriptionsRepo.create({
  merchant_id: merchant.id,
  target_url: "http://localhost:4000/webhook",
  event_types: [...WEBHOOK_EVENT_TYPES],
  signing_secret: `whsec_${randomBytes(24).toString("hex")}`,
});

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

const invoiceTermsOrder = ordersRepo.create({
  merchant_id: merchant.id,
  external_ca_order_number: "CA-100236",
  customer_name: "Riverside Builders LLC",
  customer_id: "cust_riverside_builders",
  delivery_address: "1200 Industrial Pkwy",
  material_description: "Crushed Limestone Base - 15 tons",
  amount_due_cents: 65_000,
  order_type: "invoice_terms",
  requested_delivery_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
});

const invoice = invoicesRepo.create({
  merchant_id: merchant.id,
  order_id: invoiceTermsOrder.id,
  invoice_number: "INV-5001",
  amount_due_cents: invoiceTermsOrder.amount_due_cents,
  due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
});

console.log("\nSeed complete.\n");
console.log("Merchant:");
console.log(`  id:       ${merchant.id}`);
console.log(`  name:     ${merchant.name}`);
console.log(`  api_key:  ${merchant.api_key}`);
console.log("\nWebhook subscription:");
console.log(`  id:              ${subscription.id}`);
console.log(`  target_url:      ${subscription.target_url}`);
console.log(`  signing_secret:  ${subscription.signing_secret}`);
console.log("\nSeeded orders:");
console.log(`  cod_cleared candidate:      ${codOrderCleared.id} (${codOrderCleared.customer_name}, $${codOrderCleared.amount_due_cents / 100})`);
console.log(`  cod_hold candidate:         ${codOrderLargeFirstTime.id} (${codOrderLargeFirstTime.customer_name}, $${codOrderLargeFirstTime.amount_due_cents / 100}, no payment history)`);
console.log(`  invoice_terms + invoice:    ${invoiceTermsOrder.id} / ${invoice.id}`);
console.log("\nRun `npm run webhook-receiver` in one terminal and `npm run dev` in another, then `npm run demo`.\n");
