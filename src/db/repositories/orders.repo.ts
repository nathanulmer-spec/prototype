import { getDb } from "../client.js";
import { makeId } from "../../utils/ids.js";
import type { Order, OrderStatus, OrderType } from "../../domain/order.js";

export interface CreateOrderInput {
  merchant_id: string;
  external_ca_order_number?: string | null;
  customer_name: string;
  customer_id: string;
  delivery_address: string;
  material_description: string;
  amount_due_cents: number;
  currency?: string;
  order_type: OrderType;
  requested_delivery_at?: string | null;
}

export interface OrderListFilters {
  status?: OrderStatus;
  customer_id?: string;
  limit?: number;
  offset?: number;
}

export const ordersRepo = {
  create(input: CreateOrderInput): Order {
    const db = getDb();
    const now = new Date().toISOString();
    const order: Order = {
      id: makeId("ord"),
      merchant_id: input.merchant_id,
      external_ca_order_number: input.external_ca_order_number ?? null,
      customer_name: input.customer_name,
      customer_id: input.customer_id,
      delivery_address: input.delivery_address,
      material_description: input.material_description,
      amount_due_cents: input.amount_due_cents,
      currency: input.currency ?? "usd",
      order_type: input.order_type,
      status: "created",
      requested_delivery_at: input.requested_delivery_at ?? null,
      created_at: now,
      updated_at: now,
    };
    db.prepare(
      `INSERT INTO orders (
        id, merchant_id, external_ca_order_number, customer_name, customer_id,
        delivery_address, material_description, amount_due_cents, currency,
        order_type, status, requested_delivery_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      order.id,
      order.merchant_id,
      order.external_ca_order_number,
      order.customer_name,
      order.customer_id,
      order.delivery_address,
      order.material_description,
      order.amount_due_cents,
      order.currency,
      order.order_type,
      order.status,
      order.requested_delivery_at,
      order.created_at,
      order.updated_at,
    );
    return order;
  },

  findById(merchantId: string, id: string): Order | undefined {
    const db = getDb();
    return db
      .prepare(`SELECT * FROM orders WHERE id = ? AND merchant_id = ?`)
      .get(id, merchantId) as Order | undefined;
  },

  list(merchantId: string, filters: OrderListFilters = {}): Order[] {
    const db = getDb();
    const clauses = ["merchant_id = ?"];
    const params: (string | number)[] = [merchantId];

    if (filters.status) {
      clauses.push("status = ?");
      params.push(filters.status);
    }
    if (filters.customer_id) {
      clauses.push("customer_id = ?");
      params.push(filters.customer_id);
    }

    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    return db
      .prepare(
        `SELECT * FROM orders WHERE ${clauses.join(" AND ")}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as unknown as Order[];
  },

  updateStatus(merchantId: string, id: string, status: OrderStatus): Order | undefined {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(`UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND merchant_id = ?`).run(
      status,
      now,
      id,
      merchantId,
    );
    return this.findById(merchantId, id);
  },
};
