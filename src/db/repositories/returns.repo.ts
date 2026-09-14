import { getDb } from "../client.js";
import { makeId } from "../../utils/ids.js";
import type { Return } from "../../domain/return.js";

export interface CreateReturnInput {
  merchant_id: string;
  transaction_id: string;
  amount_cents: number;
  reason: string;
}

export interface ReturnListFilters {
  transaction_id?: string;
  limit?: number;
  offset?: number;
}

export const returnsRepo = {
  create(input: CreateReturnInput): Return {
    const db = getDb();
    const now = new Date().toISOString();
    const ret: Return = {
      id: makeId("ret"),
      merchant_id: input.merchant_id,
      transaction_id: input.transaction_id,
      amount_cents: input.amount_cents,
      reason: input.reason,
      returned_at: now,
      created_at: now,
    };
    db.prepare(
      `INSERT INTO returns (id, merchant_id, transaction_id, amount_cents, reason, returned_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(ret.id, ret.merchant_id, ret.transaction_id, ret.amount_cents, ret.reason, ret.returned_at, ret.created_at);
    return ret;
  },

  findById(merchantId: string, id: string): Return | undefined {
    const db = getDb();
    return db
      .prepare(`SELECT * FROM returns WHERE id = ? AND merchant_id = ?`)
      .get(id, merchantId) as Return | undefined;
  },

  list(merchantId: string, filters: ReturnListFilters = {}): Return[] {
    const db = getDb();
    const clauses = ["merchant_id = ?"];
    const params: (string | number)[] = [merchantId];

    if (filters.transaction_id) {
      clauses.push("transaction_id = ?");
      params.push(filters.transaction_id);
    }

    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    return db
      .prepare(
        `SELECT * FROM returns WHERE ${clauses.join(" AND ")}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as unknown as Return[];
  },

  report(merchantId: string, from?: string, to?: string): { total_returned_cents: number; count: number } {
    const db = getDb();
    const clauses = ["merchant_id = ?"];
    const params: (string | number)[] = [merchantId];
    if (from) {
      clauses.push("returned_at >= ?");
      params.push(from);
    }
    if (to) {
      clauses.push("returned_at <= ?");
      params.push(to);
    }
    const row = db
      .prepare(
        `SELECT COALESCE(SUM(amount_cents), 0) as total_returned_cents, COUNT(*) as count
         FROM returns WHERE ${clauses.join(" AND ")}`,
      )
      .get(...params) as { total_returned_cents: number; count: number };
    return row;
  },

  // Chargebacks are just returns on card transactions specifically, tracked
  // separately since a card dispute has different real-world implications
  // (dispute window, potential merchant liability) than an ACH return.
  chargebacksReport(
    merchantId: string,
    from?: string,
    to?: string,
  ): { total_chargeback_cents: number; chargeback_count: number } {
    const db = getDb();
    const clauses = ["r.merchant_id = ?", "t.payment_method = 'card'"];
    const params: (string | number)[] = [merchantId];
    if (from) {
      clauses.push("r.returned_at >= ?");
      params.push(from);
    }
    if (to) {
      clauses.push("r.returned_at <= ?");
      params.push(to);
    }
    const row = db
      .prepare(
        `SELECT COALESCE(SUM(r.amount_cents), 0) as total_chargeback_cents, COUNT(*) as chargeback_count
         FROM returns r JOIN transactions t ON t.id = r.transaction_id
         WHERE ${clauses.join(" AND ")}`,
      )
      .get(...params) as { total_chargeback_cents: number; chargeback_count: number };
    return row;
  },
};
