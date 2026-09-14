import { getDb } from "../../db/client.js";
import { fundingBatchesRepo } from "../../db/repositories/fundingBatches.repo.js";
import { returnsRepo } from "../../db/repositories/returns.repo.js";
import { transactionsRepo } from "../../db/repositories/transactions.repo.js";

export interface BusinessSummaryReport {
  range: { from: string | null; to: string | null };
  orders: {
    created_count: number;
    total_amount_due_cents: number;
    by_status: Record<string, number>;
    by_order_type: Record<string, number>;
  };
  cod_risk: {
    checks_performed: number;
    cleared_count: number;
    hold_count: number;
    declined_count: number;
  };
  payments: {
    succeeded_count: number;
    succeeded_card_cents: number;
    succeeded_ach_cents: number;
    failed_count: number;
  };
  returns: {
    total_count: number;
    total_returned_cents: number;
    chargeback_count: number;
    chargeback_cents: number;
  };
  funding: {
    batches_deposited: number;
    net_deposit_cents: number;
    fee_cents: number;
  };
  reconciliation: {
    reconciled_in_range_count: number;
    reconciled_in_range_cents: number;
    currently_open_invoice_count: number;
    currently_open_amount_cents: number;
    currently_unmatched_transaction_count: number;
    currently_unmatched_amount_cents: number;
  };
  notifications_sent: number;
}

export interface BuildSummaryInput {
  merchant_id: string;
  /** Plain dates, e.g. "2026-09-01". Omit either bound for an open range. */
  from?: string;
  to?: string;
}

function dateRangeClause(column: string, fromIso?: string, toIso?: string) {
  const clauses: string[] = [];
  const params: string[] = [];
  if (fromIso) {
    clauses.push(`${column} >= ?`);
    params.push(fromIso);
  }
  if (toIso) {
    clauses.push(`${column} <= ?`);
    params.push(toIso);
  }
  return { sql: clauses.map((c) => `AND ${c}`).join(" "), params };
}

/**
 * A single cross-cutting business report, combining every domain the
 * merchant API tracks. "Activity" metrics (orders created, payments
 * processed, returns issued, invoices reconciled) are scoped to the given
 * date range; "current state" metrics (open invoices, unmatched
 * transactions) are always as-of-now, the same way a balance differs from
 * activity in a real financial report.
 */
export function buildBusinessSummary(input: BuildSummaryInput): BusinessSummaryReport {
  const db = getDb();
  const { merchant_id, from, to } = input;
  const fromIso = from ? `${from}T00:00:00.000Z` : undefined;
  const toIso = to ? `${to}T23:59:59.999Z` : undefined;

  const ordersDate = dateRangeClause("created_at", fromIso, toIso);
  const orderRows = db
    .prepare(
      `SELECT status, order_type, COUNT(*) as count, COALESCE(SUM(amount_due_cents), 0) as total
       FROM orders WHERE merchant_id = ? ${ordersDate.sql}
       GROUP BY status, order_type`,
    )
    .all(merchant_id, ...ordersDate.params) as {
    status: string;
    order_type: string;
    count: number;
    total: number;
  }[];

  const by_status: Record<string, number> = {};
  const by_order_type: Record<string, number> = {};
  let created_count = 0;
  let total_amount_due_cents = 0;
  for (const row of orderRows) {
    by_status[row.status] = (by_status[row.status] ?? 0) + row.count;
    by_order_type[row.order_type] = (by_order_type[row.order_type] ?? 0) + row.count;
    created_count += row.count;
    total_amount_due_cents += row.total;
  }

  const codDate = dateRangeClause("checked_at", fromIso, toIso);
  const codRows = db
    .prepare(
      `SELECT risk_status, COUNT(*) as count FROM cod_checks WHERE merchant_id = ? ${codDate.sql}
       GROUP BY risk_status`,
    )
    .all(merchant_id, ...codDate.params) as { risk_status: string; count: number }[];

  let checks_performed = 0;
  let cleared_count = 0;
  let hold_count = 0;
  let declined_count = 0;
  for (const row of codRows) {
    checks_performed += row.count;
    if (row.risk_status === "cleared") cleared_count = row.count;
    if (row.risk_status === "hold") hold_count = row.count;
    if (row.risk_status === "declined") declined_count = row.count;
  }

  const txnDate = dateRangeClause("created_at", fromIso, toIso);
  const txnRows = db
    .prepare(
      `SELECT status, payment_method, COUNT(*) as count, COALESCE(SUM(amount_cents), 0) as total
       FROM transactions WHERE merchant_id = ? ${txnDate.sql}
       GROUP BY status, payment_method`,
    )
    .all(merchant_id, ...txnDate.params) as {
    status: string;
    payment_method: string;
    count: number;
    total: number;
  }[];

  let succeeded_count = 0;
  let succeeded_card_cents = 0;
  let succeeded_ach_cents = 0;
  let failed_count = 0;
  for (const row of txnRows) {
    if (row.status === "succeeded") {
      succeeded_count += row.count;
      if (row.payment_method === "card") succeeded_card_cents += row.total;
      if (row.payment_method === "ach") succeeded_ach_cents += row.total;
    } else if (row.status === "failed") {
      failed_count += row.count;
    }
  }

  const returnsReport = returnsRepo.report(merchant_id, fromIso, toIso);
  const chargebacks = returnsRepo.chargebacksReport(merchant_id, fromIso, toIso);

  // funding_batches.batch_date is a plain date column, so it takes the raw
  // from/to (not the end-of-day-adjusted ISO timestamps used above).
  const fundingReport = fundingBatchesRepo.report(merchant_id, from, to);

  const reconciledDate = dateRangeClause("reconciled_at", fromIso, toIso);
  const reconciledRow = db
    .prepare(
      `SELECT COUNT(*) as count, COALESCE(SUM(amount_paid_cents), 0) as total
       FROM invoices WHERE merchant_id = ? AND status = 'reconciled' ${reconciledDate.sql}`,
    )
    .get(merchant_id, ...reconciledDate.params) as { count: number; total: number };

  const openRow = db
    .prepare(
      `SELECT COUNT(*) as count, COALESCE(SUM(amount_due_cents - amount_paid_cents), 0) as total
       FROM invoices WHERE merchant_id = ? AND status IN ('open', 'partially_paid', 'overdue')`,
    )
    .get(merchant_id) as { count: number; total: number };

  const unmatched = transactionsRepo.listUnmatched(merchant_id);
  const unmatchedAmountCents = unmatched.reduce((sum, t) => sum + t.amount_cents, 0);

  const notifDate = dateRangeClause("created_at", fromIso, toIso);
  const notifRow = db
    .prepare(`SELECT COUNT(*) as count FROM notification_log WHERE merchant_id = ? ${notifDate.sql}`)
    .get(merchant_id, ...notifDate.params) as { count: number };

  return {
    range: { from: from ?? null, to: to ?? null },
    orders: { created_count, total_amount_due_cents, by_status, by_order_type },
    cod_risk: { checks_performed, cleared_count, hold_count, declined_count },
    payments: { succeeded_count, succeeded_card_cents, succeeded_ach_cents, failed_count },
    returns: {
      total_count: returnsReport.count,
      total_returned_cents: returnsReport.total_returned_cents,
      chargeback_count: chargebacks.chargeback_count,
      chargeback_cents: chargebacks.total_chargeback_cents,
    },
    funding: {
      batches_deposited: fundingReport.batch_count,
      net_deposit_cents: fundingReport.total_net_deposit_cents,
      fee_cents: fundingReport.total_fee_cents,
    },
    reconciliation: {
      reconciled_in_range_count: reconciledRow.count,
      reconciled_in_range_cents: reconciledRow.total,
      currently_open_invoice_count: openRow.count,
      currently_open_amount_cents: openRow.total,
      currently_unmatched_transaction_count: unmatched.length,
      currently_unmatched_amount_cents: unmatchedAmountCents,
    },
    notifications_sent: notifRow.count,
  };
}

function csvEscape(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildBusinessSummaryCsv(report: BusinessSummaryReport): string {
  const rows: [string, string, string | number][] = [
    ["Range", "From", report.range.from ?? "all time"],
    ["Range", "To", report.range.to ?? "now"],
    ["Orders", "Created", report.orders.created_count],
    ["Orders", "Total amount due (cents)", report.orders.total_amount_due_cents],
    ["Orders", "COD orders", report.orders.by_order_type.cod ?? 0],
    ["Orders", "Invoice orders", report.orders.by_order_type.invoice ?? 0],
    ["Orders", "Prepaid orders", report.orders.by_order_type.prepaid ?? 0],
    ["COD risk", "Checks performed", report.cod_risk.checks_performed],
    ["COD risk", "Cleared", report.cod_risk.cleared_count],
    ["COD risk", "Hold", report.cod_risk.hold_count],
    ["COD risk", "Declined", report.cod_risk.declined_count],
    ["Payments", "Succeeded", report.payments.succeeded_count],
    ["Payments", "Card collected (cents)", report.payments.succeeded_card_cents],
    ["Payments", "ACH collected (cents)", report.payments.succeeded_ach_cents],
    ["Payments", "Failed", report.payments.failed_count],
    ["Returns", "Total returns", report.returns.total_count],
    ["Returns", "Total returned (cents)", report.returns.total_returned_cents],
    ["Returns", "Chargebacks", report.returns.chargeback_count],
    ["Returns", "Chargeback amount (cents)", report.returns.chargeback_cents],
    ["Funding", "Batches deposited", report.funding.batches_deposited],
    ["Funding", "Net deposit (cents)", report.funding.net_deposit_cents],
    ["Funding", "Fees (cents)", report.funding.fee_cents],
    ["Reconciliation", "Reconciled in range", report.reconciliation.reconciled_in_range_count],
    ["Reconciliation", "Reconciled amount (cents)", report.reconciliation.reconciled_in_range_cents],
    ["Reconciliation", "Currently open invoices", report.reconciliation.currently_open_invoice_count],
    ["Reconciliation", "Currently open amount (cents)", report.reconciliation.currently_open_amount_cents],
    ["Reconciliation", "Unmatched transactions", report.reconciliation.currently_unmatched_transaction_count],
    ["Reconciliation", "Unmatched amount (cents)", report.reconciliation.currently_unmatched_amount_cents],
    ["Notifications", "Sent", report.notifications_sent],
  ];

  const header = "Section,Metric,Value";
  const lines = rows.map(([section, metric, value]) => [section, metric, value].map(csvEscape).join(","));
  return [header, ...lines].join("\n");
}
