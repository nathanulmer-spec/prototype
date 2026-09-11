import { getDb } from "../../db/client.js";
import { transactionsRepo } from "../../db/repositories/transactions.repo.js";

export interface ReconciliationReport {
  reconciled_invoice_count: number;
  reconciled_amount_cents: number;
  open_invoice_count: number;
  open_amount_cents: number;
  unmatched_transaction_count: number;
  unmatched_amount_cents: number;
  average_time_to_reconcile_seconds: number | null;
}

export function buildReconciliationReport(merchantId: string): ReconciliationReport {
  const db = getDb();

  const reconciled = db
    .prepare(
      `SELECT COUNT(*) as count, COALESCE(SUM(amount_paid_cents), 0) as total_cents
       FROM invoices WHERE merchant_id = ? AND status = 'reconciled'`,
    )
    .get(merchantId) as { count: number; total_cents: number };

  const open = db
    .prepare(
      `SELECT COUNT(*) as count, COALESCE(SUM(amount_due_cents - amount_paid_cents), 0) as total_cents
       FROM invoices WHERE merchant_id = ? AND status IN ('open', 'partially_paid', 'overdue')`,
    )
    .get(merchantId) as { count: number; total_cents: number };

  const avgSecondsRow = db
    .prepare(
      `SELECT AVG(
         (julianday(reconciled_at) - julianday(created_at)) * 86400
       ) as avg_seconds
       FROM invoices WHERE merchant_id = ? AND status = 'reconciled' AND reconciled_at IS NOT NULL`,
    )
    .get(merchantId) as { avg_seconds: number | null };

  const unmatched = transactionsRepo.listUnmatched(merchantId);
  const unmatchedAmountCents = unmatched.reduce((sum, t) => sum + t.amount_cents, 0);

  return {
    reconciled_invoice_count: reconciled.count,
    reconciled_amount_cents: reconciled.total_cents,
    open_invoice_count: open.count,
    open_amount_cents: open.total_cents,
    unmatched_transaction_count: unmatched.length,
    unmatched_amount_cents: unmatchedAmountCents,
    average_time_to_reconcile_seconds: avgSecondsRow.avg_seconds,
  };
}
