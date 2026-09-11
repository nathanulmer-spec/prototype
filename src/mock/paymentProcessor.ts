import { makeId } from "../utils/ids.js";
import type { PaymentMethod } from "../domain/transaction.js";

export interface AuthorizeInput {
  amount_cents: number;
  payment_method: PaymentMethod;
  simulate?: "success" | "fail";
}

export interface AuthorizeResult {
  succeeded: boolean;
  failure_reason: string | null;
  processor_reference: string;
}

/**
 * Stands in for a real processor call. There's no network hop here, but the
 * shape (async, can fail, returns a processor reference) mirrors one.
 */
export async function authorize(input: AuthorizeInput): Promise<AuthorizeResult> {
  const processorReference = `sim_${makeId("txn").slice(4)}`;

  if (input.simulate === "fail") {
    return {
      succeeded: false,
      failure_reason: "simulated_decline",
      processor_reference: processorReference,
    };
  }

  // Deterministic magic amount so demo scripts can force a failure without
  // relying on randomness: any amount ending in .13 declines.
  if (input.amount_cents % 100 === 13) {
    return {
      succeeded: false,
      failure_reason: "insufficient_funds",
      processor_reference: processorReference,
    };
  }

  return { succeeded: true, failure_reason: null, processor_reference: processorReference };
}

export interface RefundResult {
  succeeded: boolean;
  processor_reference: string;
}

export async function refund(_transactionId: string): Promise<RefundResult> {
  return { succeeded: true, processor_reference: `sim_refund_${makeId("txn").slice(4)}` };
}

export interface VerifyPaymentMethodInput {
  customer_name: string;
  amount_cents: number;
  payment_method: PaymentMethod;
}

export interface VerifyPaymentMethodResult {
  verified: boolean;
  reason: string;
}

/**
 * Simulated card/ACH verification against the processor, independent of any
 * merchant-side risk policy. Magic customer-name prefixes make demo runs
 * repeatable: "DECLINE-" always fails verification.
 */
export async function verifyPaymentMethod(
  input: VerifyPaymentMethodInput,
): Promise<VerifyPaymentMethodResult> {
  if (input.customer_name.startsWith("DECLINE-")) {
    return { verified: false, reason: "payment method could not be verified with processor" };
  }
  return { verified: true, reason: "payment method verified" };
}
