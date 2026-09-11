import { getDb } from "../src/db/client.js";
import { merchantsRepo } from "../src/db/repositories/merchants.repo.js";
import { ordersRepo } from "../src/db/repositories/orders.repo.js";
import { invoicesRepo } from "../src/db/repositories/invoices.repo.js";
import { webhookDeliveriesRepo } from "../src/db/repositories/webhookDeliveries.repo.js";

const BASE_URL = "http://localhost:3000/api/v1";

function banner(title: string) {
  console.log(`\n=== ${title} ===`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function call(
  apiKey: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function waitForDelivered(merchantId: string, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const deliveries = webhookDeliveriesRepo.list(merchantId, { limit: 50 });
    if (deliveries.length > 0 && deliveries.every((d) => d.status === "delivered")) return;
    await sleep(300);
  }
}

async function main() {
  getDb();
  const merchant = merchantsRepo.list()[0];
  if (!merchant) {
    console.error("No merchant found. Run `npm run seed` first.");
    process.exit(1);
  }

  console.log(`Using merchant ${merchant.id} (${merchant.name})`);
  console.log("Make sure `npm run dev` and `npm run webhook-receiver` are both running.");

  const codClearedOrder = ordersRepo
    .list(merchant.id, { limit: 50 })
    .find((o) => o.order_type === "cod" && o.amount_due_cents < 500_000);
  const codHoldOrder = ordersRepo
    .list(merchant.id, { limit: 50 })
    .find((o) => o.order_type === "cod" && o.amount_due_cents >= 500_000);
  const invoiceTermsOrder = ordersRepo
    .list(merchant.id, { limit: 50 })
    .find((o) => o.order_type === "invoice_terms");

  if (!codClearedOrder || !codHoldOrder || !invoiceTermsOrder) {
    console.error("Expected seeded orders were not found. Run `npm run seed` first.");
    process.exit(1);
  }

  banner("1. Command Alkon order sync simulation");
  const caSync = await call(merchant.api_key, "POST", "/_demo/simulate-ca-order-sync", {
    order_type: "cod",
  });
  console.log(`New order synced from Command Cloud: ${caSync.json.id} (${caSync.json.customer_name})`);

  banner("2. COD risk check: small repeat-customer order (expect cleared)");
  const clearedCheck = await call(
    merchant.api_key,
    "POST",
    `/orders/${codClearedOrder.id}/cod-check`,
    { payment_method: "card" },
  );
  console.log(`Risk status: ${clearedCheck.json.risk_status} - ${clearedCheck.json.reason}`);

  banner("3. Dispatch attempt on cleared order (expect success)");
  const dispatch1 = await call(merchant.api_key, "POST", `/orders/${codClearedOrder.id}/dispatch`);
  console.log(`Dispatch result: HTTP ${dispatch1.status}, order status = ${dispatch1.json.status ?? dispatch1.json.error?.message}`);

  banner("4. COD risk check: large first-time order (expect hold)");
  const holdCheck = await call(
    merchant.api_key,
    "POST",
    `/orders/${codHoldOrder.id}/cod-check`,
    { payment_method: "ach" },
  );
  console.log(`Risk status: ${holdCheck.json.risk_status} - ${holdCheck.json.reason}`);

  banner("5. Dispatch attempt on held order (expect blocked)");
  const dispatch2 = await call(merchant.api_key, "POST", `/orders/${codHoldOrder.id}/dispatch`);
  console.log(`Dispatch result: HTTP ${dispatch2.status} - ${dispatch2.json.error?.message ?? "unexpectedly allowed"}`);

  banner("6. Simulate payment against the invoice-terms order");
  const payment = await call(merchant.api_key, "POST", "/_demo/simulate-payment", {
    order_id: invoiceTermsOrder.id,
    payment_method: "ach",
  });
  console.log(`Transaction ${payment.json.id} -> ${payment.json.status}`);

  banner("7. Waiting for webhook delivery to local receiver...");
  await waitForDelivered(merchant.id);
  const deliveries = webhookDeliveriesRepo.list(merchant.id, { limit: 50 });
  for (const d of deliveries) {
    console.log(`  ${d.event_type}: ${d.status} (attempts=${d.attempt_count}, http=${d.response_status_code})`);
  }

  banner("8. Invoice auto-reconciliation check");
  const targetInvoice = invoicesRepo
    .list(merchant.id, { limit: 50 })
    .find((i) => i.order_id === invoiceTermsOrder.id);
  console.log(`Invoice ${targetInvoice?.id}: status = ${targetInvoice?.status}, paid = ${targetInvoice?.amount_paid_cents}/${targetInvoice?.amount_due_cents} cents`);

  banner("9. Reconciliation report");
  const report = await call(merchant.api_key, "GET", "/reconciliation/report");
  console.log(report.json);

  banner("10. Simulate nightly funding batch");
  const batch = await call(merchant.api_key, "POST", "/_demo/simulate-funding-batch", {});
  console.log(`Funding batch ${batch.json.id}: net deposit $${(batch.json.net_deposit_cents ?? 0) / 100}`);

  banner("11. Funding report");
  const fundingReport = await call(merchant.api_key, "GET", "/funding/report");
  console.log(fundingReport.json);

  banner("Demo complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
