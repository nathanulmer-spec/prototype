import { getDb } from "../client.js";
import { makeId } from "../../utils/ids.js";
import type { PaymentMethod, Transaction, TransactionStatus } from "../../domain/transaction.js";

export interface CreateTransactionInput {
  merchant_id: string;
  invoice_id?: string | null;
  order_id?: string | null;
  amount_cents: number;
  currency?: string;
  payment_method: PaymentMethod;
  payment_method_last4?: string | null;
}

export interface TransactionListFilters {
  status?: TransactionStatus;
  order_id?: string;
  invoice_id?: string;
  limit?: number;
  offset?: number;
}

export const transactionsRepo = {
  create(input: CreateTransactionInput): Transaction {
    const db = getDb();
    const now = new Date().toISOString();
    const txn: Transaction = {
      id: makeId("txn"),
      merchant_id: input.merchant_id,
      invoice_id: input.invoice_id ?? null,
      order_id: input.order_id ?? null,
      amount_cents: input.amount_cents,
      currency: input.currency ?? "usd",
      payment_method: input.payment_method,
      payment_method_last4: input.payment_method_last4 ?? null,
      status: "pending",
      failure_reason: null,
      processor_reference: null,
      funding_batch_id: null,
      created_at: now,
      updated_at: now,
    };
    db.prepare(
      `INSERT INTO transactions (
        id, merchant_id, invoice_id, order_id, amount_cents, currency,
        payment_method, payment_method_last4, status, failure_reason,
        processor_reference, funding_batch_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      txn.id,
      txn.merchant_id,
      txn.invoice_id,
      txn.order_id,
      txn.amount_cents,
      txn.currency,
      txn.payment_method,
      txn.payment_method_last4,
      txn.status,
      txn.failure_reason,
      txn.processor_reference,
      txn.funding_batch_id,
      txn.created_at,
      txn.updated_at,
    );
    return txn;
  },

  findById(merchantId: string, id: string): Transaction | undefined {
    const db = getDb();
    return db
      .prepare(`SELECT * FROM transactions WHERE id = ? AND merchant_id = ?`)
      .get(id, merchantId) as Transaction | undefined;
  },

  list(merchantId: string, filters: TransactionListFilters = {}): Transaction[] {
    const db = getDb();
    const clauses = ["merchant_id = ?"];
    const params: (string | number)[] = [merchantId];

    if (filters.status) {
      clauses.push("status = ?");
      params.push(filters.status);
    }
    if (filters.order_id) {
      clauses.push("order_id = ?");
      params.push(filters.order_id);
    }
    if (filters.invoice_id) {
      clauses.push("invoice_id = ?");
      params.push(filters.invoice_id);
    }

    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    return db
      .prepare(
        `SELECT * FROM transactions WHERE ${clauses.join(" AND ")}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as unknown as Transaction[];
  },

  updateStatus(
    merchantId: string,
    id: string,
    status: TransactionStatus,
    extra: { failure_reason?: string | null; processor_reference?: string | null } = {},
  ): Transaction | undefined {
    const db = getDb();
    const now = new Date().toISOString();
    const current = this.findById(merchantId, id);
    if (!current) return undefined;

    db.prepare(
      `UPDATE transactions
       SET status = ?, failure_reason = ?, processor_reference = ?, updated_at = ?
       WHERE id = ? AND merchant_id = ?`,
    ).run(
      status,
      extra.failure_reason ?? current.failure_reason,
      extra.processor_reference ?? current.processor_reference,
      now,
      id,
      merchantId,
    );
    return this.findById(merchantId, id);
  },

  assignFundingBatch(merchantId: string, id: string, fundingBatchId: string): void {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE transactions SET funding_batch_id = ?, updated_at = ? WHERE id = ? AND merchant_id = ?`,
    ).run(fundingBatchId, now, id, merchantId);
  },

  listSucceededUnbatched(merchantId: string): Transaction[] {
    const db = getDb();
    return db
      .prepare(
        `SELECT * FROM transactions
         WHERE merchant_id = ? AND status = 'succeeded' AND funding_batch_id IS NULL`,
      )
      .all(merchantId) as unknown as Transaction[];
  },

  countSucceededForCustomer(merchantId: string, customerId: string): number {
    const db = getDb();
    const row = db
      .prepare(
        `SELECT COUNT(*) as count FROM transactions t
         JOIN orders o ON o.id = t.order_id
         WHERE t.merchant_id = ? AND o.customer_id = ? AND t.status = 'succeeded'`,
      )
      .get(merchantId, customerId) as { count: number };
    return row.count;
  },

  linkInvoice(merchantId: string, id: string, invoiceId: string): void {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE transactions SET invoice_id = ?, updated_at = ? WHERE id = ? AND merchant_id = ?`,
    ).run(invoiceId, now, id, merchantId);
  },

  listUnmatched(merchantId: string): Transaction[] {
    const db = getDb();
    return db
      .prepare(
        `SELECT * FROM transactions
         WHERE merchant_id = ? AND status = 'succeeded' AND invoice_id IS NULL
         ORDER BY created_at DESC`,
      )
      .all(merchantId) as unknown as Transaction[];
  },
};
