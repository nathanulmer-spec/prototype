import { Router } from "express";
import { z } from "zod";
import { ordersRepo } from "../../db/repositories/orders.repo.js";
import { invoicesRepo } from "../../db/repositories/invoices.repo.js";
import { transactionsRepo } from "../../db/repositories/transactions.repo.js";
import { fundingBatchesRepo } from "../../db/repositories/fundingBatches.repo.js";
import { authorize } from "../../mock/paymentProcessor.js";
import { simulateCommandAlkonOrderSync } from "../../mock/commandAlkonSync.js";
import { eventBus } from "../../webhooks/eventBus.js";
import { asyncHandler, validateBody } from "../../middleware/validate.js";
import { ApiError } from "../../middleware/errorHandler.js";

/**
 * Simulation-only endpoints, namespaced away from the "real" merchant API
 * surface. They exist so this prototype is demoable without a live
 * processor or a live Command Alkon connection.
 */
export const demoRouter = Router();

const caSyncSchema = z.object({
  order_type: z.enum(["cod", "invoice_terms", "prepaid"]).optional(),
  customer_name: z.string().optional(),
  amount_due_cents: z.number().int().positive().optional(),
});

demoRouter.post(
  "/_demo/simulate-ca-order-sync",
  validateBody(caSyncSchema),
  asyncHandler(async (req, res) => {
    const order = simulateCommandAlkonOrderSync({ merchant_id: req.merchant!.id, ...req.body });
    res.status(201).json(order);
  }),
);

const simulatePaymentSchema = z.object({
  order_id: z.string().min(1),
  payment_method: z.enum(["card", "ach"]),
  simulate: z.enum(["success", "fail"]).optional(),
});

demoRouter.post(
  "/_demo/simulate-payment",
  validateBody(simulatePaymentSchema),
  asyncHandler(async (req, res) => {
    const merchantId = req.merchant!.id;
    const order = ordersRepo.findById(merchantId, req.body.order_id);
    if (!order) throw new ApiError(404, "Order not found");

    const invoice = invoicesRepo.findOpenByOrderId(merchantId, order.id);

    const txn = transactionsRepo.create({
      merchant_id: merchantId,
      order_id: order.id,
      invoice_id: invoice?.id ?? null,
      amount_cents: order.amount_due_cents,
      payment_method: req.body.payment_method,
    });

    const result = await authorize({
      amount_cents: txn.amount_cents,
      payment_method: txn.payment_method,
      simulate: req.body.simulate,
    });

    const updated = transactionsRepo.updateStatus(
      merchantId,
      txn.id,
      result.succeeded ? "succeeded" : "failed",
      { failure_reason: result.failure_reason, processor_reference: result.processor_reference },
    )!;

    eventBus.emitEvent(result.succeeded ? "payment.succeeded" : "payment.failed", merchantId, updated);
    res.status(201).json(updated);
  }),
);

const simulateFundingBatchSchema = z.object({
  fee_bps: z.number().min(0).max(1000).optional(),
});

demoRouter.post(
  "/_demo/simulate-funding-batch",
  validateBody(simulateFundingBatchSchema),
  asyncHandler(async (req, res) => {
    const merchantId = req.merchant!.id;
    const unbatched = transactionsRepo.listSucceededUnbatched(merchantId);
    if (unbatched.length === 0) {
      throw new ApiError(409, "No succeeded, unbatched transactions to fund");
    }

    const feeBps = req.body.fee_bps ?? 29; // 0.29% flat, illustrative only
    const cardTotal = unbatched
      .filter((t) => t.payment_method === "card")
      .reduce((sum, t) => sum + t.amount_cents, 0);
    const achTotal = unbatched
      .filter((t) => t.payment_method === "ach")
      .reduce((sum, t) => sum + t.amount_cents, 0);
    const feeTotal = Math.round(((cardTotal + achTotal) * feeBps) / 10_000);

    const batch = fundingBatchesRepo.create({
      merchant_id: merchantId,
      batch_date: new Date().toISOString().slice(0, 10),
      card_total_cents: cardTotal,
      ach_total_cents: achTotal,
      fee_total_cents: feeTotal,
    });

    for (const txn of unbatched) {
      transactionsRepo.assignFundingBatch(merchantId, txn.id, batch.id);
    }

    const deposited = fundingBatchesRepo.markDeposited(merchantId, batch.id)!;
    eventBus.emitEvent("funding.batch.deposited", merchantId, deposited);
    res.status(201).json(deposited);
  }),
);
