import type { Invoice } from "../../domain/invoice.js";

/** Cents of slack allowed between a transaction amount and an invoice's remaining balance. */
export const RECONCILIATION_TOLERANCE_CENTS = 0;

export function remainingBalanceCents(invoice: Invoice): number {
  return invoice.amount_due_cents - invoice.amount_paid_cents;
}

export function amountsMatch(
  invoice: Invoice,
  transactionAmountCents: number,
  toleranceCents = RECONCILIATION_TOLERANCE_CENTS,
): boolean {
  return Math.abs(remainingBalanceCents(invoice) - transactionAmountCents) <= toleranceCents;
}
