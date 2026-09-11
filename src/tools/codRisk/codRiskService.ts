import { ordersRepo } from "../../db/repositories/orders.repo.js";
import { transactionsRepo } from "../../db/repositories/transactions.repo.js";
import { codChecksRepo } from "../../db/repositories/codChecks.repo.js";
import { eventBus } from "../../webhooks/eventBus.js";
import { verifyPaymentMethod } from "../../mock/paymentProcessor.js";
import { applyCodRiskRules } from "./riskRules.js";
import { ApiError } from "../../middleware/errorHandler.js";
import type { CodCheck } from "../../domain/codCheck.js";
import type { PaymentMethod } from "../../domain/transaction.js";

const COD_CHECK_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface PerformCodCheckInput {
  merchant_id: string;
  order_id: string;
  payment_method: PaymentMethod;
}

/**
 * Verifies a customer's payment method and applies merchant risk policy
 * before a COD order is cleared for dispatch. This is the concrete
 * "reduce COD risk" tool: it gives merchants a gate to check before a truck
 * rolls, instead of finding out payment was never collectible after delivery.
 */
export async function performPreDeliveryCheck(input: PerformCodCheckInput): Promise<CodCheck> {
  const order = ordersRepo.findById(input.merchant_id, input.order_id);
  if (!order) throw new ApiError(404, "Order not found");

  const priorSuccessfulPayments = transactionsRepo.countSucceededForCustomer(
    input.merchant_id,
    order.customer_id,
  );

  const processorResult = await verifyPaymentMethod({
    customer_name: order.customer_name,
    amount_cents: order.amount_due_cents,
    payment_method: input.payment_method,
  });

  const { risk_status, reason } = applyCodRiskRules({
    processorResult,
    amountDueCents: order.amount_due_cents,
    priorSuccessfulPayments,
    customerName: order.customer_name,
  });

  const check = codChecksRepo.create({
    merchant_id: input.merchant_id,
    order_id: input.order_id,
    payment_method: input.payment_method,
    risk_status,
    reason,
    ttlMs: COD_CHECK_TTL_MS,
  });

  ordersRepo.updateStatus(
    input.merchant_id,
    input.order_id,
    risk_status === "cleared" ? "cod_cleared" : "cod_hold",
  );

  eventBus.emitEvent("cod.risk.updated", input.merchant_id, {
    order_id: input.order_id,
    cod_check: check,
  });

  return check;
}

export function isDispatchClearedForCod(check: CodCheck | undefined): {
  cleared: boolean;
  reason: string;
} {
  if (!check) return { cleared: false, reason: "no COD risk check has been performed for this order" };
  if (check.risk_status !== "cleared") {
    return { cleared: false, reason: check.reason ?? `COD risk status is '${check.risk_status}'` };
  }
  if (new Date(check.expires_at).getTime() < Date.now()) {
    return { cleared: false, reason: "COD risk check has expired; re-run the check" };
  }
  return { cleared: true, reason: "cleared" };
}
