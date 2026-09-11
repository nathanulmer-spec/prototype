import { describe, expect, it } from "vitest";
import { amountsMatch, remainingBalanceCents } from "../src/tools/reconciliation/matcher.js";
import type { Invoice } from "../src/domain/invoice.js";

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "inv_test",
    merchant_id: "mer_test",
    order_id: null,
    invoice_number: "INV-1",
    amount_due_cents: 10_000,
    amount_paid_cents: 0,
    currency: "usd",
    status: "open",
    due_date: null,
    reconciled_at: null,
    reconciled_transaction_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("reconciliation matcher", () => {
  it("computes the remaining balance as due minus paid", () => {
    expect(remainingBalanceCents(makeInvoice({ amount_due_cents: 10_000, amount_paid_cents: 4_000 }))).toBe(6_000);
  });

  it("matches a transaction that exactly settles the remaining balance", () => {
    const invoice = makeInvoice({ amount_due_cents: 10_000, amount_paid_cents: 0 });
    expect(amountsMatch(invoice, 10_000)).toBe(true);
  });

  it("does not match a transaction amount that differs from the remaining balance", () => {
    const invoice = makeInvoice({ amount_due_cents: 10_000, amount_paid_cents: 0 });
    expect(amountsMatch(invoice, 9_999)).toBe(false);
  });

  it("matches a partial-balance payment against what's left owed", () => {
    const invoice = makeInvoice({ amount_due_cents: 10_000, amount_paid_cents: 4_000 });
    expect(amountsMatch(invoice, 6_000)).toBe(true);
  });
});
