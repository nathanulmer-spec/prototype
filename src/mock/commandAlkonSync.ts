import { ordersRepo } from "../db/repositories/orders.repo.js";
import { eventBus } from "../webhooks/eventBus.js";
import type { Order, OrderType } from "../domain/order.js";

const MATERIALS = [
  "4000 PSI Ready-Mix Concrete - 8 CY",
  "3500 PSI Ready-Mix Concrete - 10 CY",
  "Pea Gravel - 12 tons",
  "Crushed Limestone Base - 15 tons",
  "5000 PSI Ready-Mix Concrete - 6 CY",
];

const CUSTOMERS = [
  { id: "cust_riverside_builders", name: "Riverside Builders LLC" },
  { id: "cust_summit_paving", name: "Summit Paving Co." },
  { id: "cust_greenfield_dev", name: "Greenfield Development" },
];

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export interface SimulateCaOrderSyncInput {
  merchant_id: string;
  order_type?: OrderType;
  customer_name?: string;
  amount_due_cents?: number;
}

/**
 * Stands in for Command Cloud pushing a newly dispatched order into Fractal
 * Pay. In production this would arrive over whatever sync mechanism CA uses;
 * here we just fabricate a plausible order and drop it straight into orders.
 */
export function simulateCommandAlkonOrderSync(input: SimulateCaOrderSyncInput): Order {
  const customer = randomFrom(CUSTOMERS);
  const orderType = input.order_type ?? "cod";

  const order = ordersRepo.create({
    merchant_id: input.merchant_id,
    external_ca_order_number: `CA-${Math.floor(100000 + Math.random() * 900000)}`,
    customer_name: input.customer_name ?? customer.name,
    customer_id: customer.id,
    delivery_address: "1200 Industrial Pkwy, Building 4",
    material_description: randomFrom(MATERIALS),
    amount_due_cents: input.amount_due_cents ?? 250_000 + Math.floor(Math.random() * 750_000),
    order_type: orderType,
    requested_delivery_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  });

  eventBus.emitEvent("order.created", order.merchant_id, order);
  return order;
}
