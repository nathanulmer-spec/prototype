import { getDb } from "../../db/client.js";
import { transactionsRepo } from "../../db/repositories/transactions.repo.js";
import { returnsRepo } from "../../db/repositories/returns.repo.js";

export interface ReconciliationReport {
  reconciled_invoice_count: number;
  reconciled_amount_cents: number;
  open_invoice_count: number;
  open_amount_cents: number;
  unmatched_transaction_count: number;
  unmatched_amount_cents: number;
  chargeback_count: number;
  total_chargeback_cents: number;
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

  const unmatched = transactionsRepo.listUnmatched(merchantId);
  const unmatchedAmountCents = unmatched.reduce((sum, t) => sum + t.amount_cents, 0);

  const chargebacks = returnsRepo.chargebacksReport(merchantId);

  return {
    reconciled_invoice_count: reconciled.count,
    reconciled_amount_cents: reconciled.total_cents,
    open_invoice_count: open.count,
    open_amount_cents: open.total_cents,
    unmatched_transaction_count: unmatched.length,
    unmatched_amount_cents: unmatchedAmountCents,
    chargeback_count: chargebacks.chargeback_count,
    total_chargeback_cents: chargebacks.total_chargeback_cents,
  };
}
