import { getDb } from "../client.js";
import { makeId } from "../../utils/ids.js";
import type { Invoice, InvoiceStatus } from "../../domain/invoice.js";

export interface CreateInvoiceInput {
  merchant_id: string;
  order_id?: string | null;
  invoice_number: string;
  amount_due_cents: number;
  currency?: string;
  due_date?: string | null;
}

export interface InvoiceListFilters {
  status?: InvoiceStatus;
  limit?: number;
  offset?: number;
}

export const invoicesRepo = {
  create(input: CreateInvoiceInput): Invoice {
    const db = getDb();
    const now = new Date().toISOString();
    const invoice: Invoice = {
      id: makeId("inv"),
      merchant_id: input.merchant_id,
      order_id: input.order_id ?? null,
      invoice_number: input.invoice_number,
      amount_due_cents: input.amount_due_cents,
      amount_paid_cents: 0,
      currency: input.currency ?? "usd",
      status: "open",
      due_date: input.due_date ?? null,
      reconciled_at: null,
      reconciled_transaction_id: null,
      created_at: now,
      updated_at: now,
    };
    db.prepare(
      `INSERT INTO invoices (
        id, merchant_id, order_id, invoice_number, amount_due_cents, amount_paid_cents,
        currency, status, due_date, reconciled_at, reconciled_transaction_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      invoice.id,
      invoice.merchant_id,
      invoice.order_id,
      invoice.invoice_number,
      invoice.amount_due_cents,
      invoice.amount_paid_cents,
      invoice.currency,
      invoice.status,
      invoice.due_date,
      invoice.reconciled_at,
      invoice.reconciled_transaction_id,
      invoice.created_at,
      invoice.updated_at,
    );
    return invoice;
  },

  findById(merchantId: string, id: string): Invoice | undefined {
    const db = getDb();
    return db
      .prepare(`SELECT * FROM invoices WHERE id = ? AND merchant_id = ?`)
      .get(id, merchantId) as Invoice | undefined;
  },

  findOpenByOrderId(merchantId: string, orderId: string): Invoice | undefined {
    const db = getDb();
    return db
      .prepare(
        `SELECT * FROM invoices
         WHERE merchant_id = ? AND order_id = ? AND status IN ('open', 'partially_paid')
         ORDER BY created_at LIMIT 1`,
      )
      .get(merchantId, orderId) as Invoice | undefined;
  },

  list(merchantId: string, filters: InvoiceListFilters = {}): Invoice[] {
    const db = getDb();
    const clauses = ["merchant_id = ?"];
    const params: (string | number)[] = [merchantId];

    if (filters.status) {
      clauses.push("status = ?");
      params.push(filters.status);
    }

    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    return db
      .prepare(
        `SELECT * FROM invoices WHERE ${clauses.join(" AND ")}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as unknown as Invoice[];
  },

  applyPayment(
    merchantId: string,
    id: string,
    amountCents: number,
    transactionId: string,
  ): Invoice | undefined {
    const db = getDb();
    const invoice = this.findById(merchantId, id);
    if (!invoice) return undefined;

    const now = new Date().toISOString();
    const newPaidCents = invoice.amount_paid_cents + amountCents;
    const isFullyPaid = newPaidCents >= invoice.amount_due_cents;
    const status: InvoiceStatus = isFullyPaid ? "reconciled" : "partially_paid";

    db.prepare(
      `UPDATE invoices
       SET amount_paid_cents = ?, status = ?, updated_at = ?,
           reconciled_at = CASE WHEN ? THEN ? ELSE reconciled_at END,
           reconciled_transaction_id = CASE WHEN ? THEN ? ELSE reconciled_transaction_id END
       WHERE id = ? AND merchant_id = ?`,
    ).run(
      newPaidCents,
      status,
      now,
      isFullyPaid ? 1 : 0,
      now,
      isFullyPaid ? 1 : 0,
      transactionId,
      id,
      merchantId,
    );
    return this.findById(merchantId, id);
  },

  markReconciled(merchantId: string, id: string, transactionId: string): Invoice | undefined {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE invoices
       SET status = 'reconciled', reconciled_at = ?, reconciled_transaction_id = ?, updated_at = ?
       WHERE id = ? AND merchant_id = ?`,
    ).run(now, transactionId, now, id, merchantId);
    return this.findById(merchantId, id);
  },
};
