import type { CodRiskStatus } from "../../domain/codCheck.js";
import type { VerifyPaymentMethodResult } from "../../mock/paymentProcessor.js";

export const LARGE_ORDER_THRESHOLD_CENTS = 500_000; // $5,000

export interface RiskRuleInput {
  processorResult: VerifyPaymentMethodResult;
  amountDueCents: number;
  priorSuccessfulPayments: number;
  customerName: string;
}

export interface RiskRuleResult {
  risk_status: CodRiskStatus;
  reason: string;
}

/**
 * Merchant-side risk policy applied on top of the raw processor verification:
 * a verified payment method can still be held back for manual review before
 * a truck is dispatched.
 */
export function applyCodRiskRules(input: RiskRuleInput): RiskRuleResult {
  if (!input.processorResult.verified) {
    return { risk_status: "declined", reason: input.processorResult.reason };
  }

  if (input.customerName.startsWith("HOLD-")) {
    return { risk_status: "hold", reason: "manual review requested for this customer" };
  }

  if (input.amountDueCents >= LARGE_ORDER_THRESHOLD_CENTS && input.priorSuccessfulPayments === 0) {
    return {
      risk_status: "hold",
      reason: "large order with no prior successful payment history for this customer",
    };
  }

  return { risk_status: "cleared", reason: input.processorResult.reason };
}
