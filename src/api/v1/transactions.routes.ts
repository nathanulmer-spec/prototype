import { Router } from "express";
import { z } from "zod";
import { transactionsRepo } from "../../db/repositories/transactions.repo.js";
import { authorize, refund } from "../../mock/paymentProcessor.js";
import { eventBus } from "../../webhooks/eventBus.js";
import { asyncHandler, validateBody } from "../../middleware/validate.js";
import { ApiError } from "../../middleware/errorHandler.js";

export const transactionsRouter = Router();

const createTransactionSchema = z.object({
  invoice_id: z.string().optional(),
  order_id: z.string().optional(),
  amount_cents: z.number().int().positive(),
  currency: z.string().length(3).optional(),
  payment_method: z.enum(["card", "ach"]),
  payment_method_last4: z.string().length(4).optional(),
  simulate: z.enum(["success", "fail"]).optional(),
});

transactionsRouter.post(
  "/transactions",
  validateBody(createTransactionSchema),
  asyncHandler(async (req, res) => {
    const { simulate, ...input } = req.body;
    const merchantId = req.merchant!.id;

    const txn = transactionsRepo.create({ merchant_id: merchantId, ...input });

    const result = await authorize({
      amount_cents: txn.amount_cents,
      payment_method: txn.payment_method,
      simulate,
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

transactionsRouter.get(
  "/transactions",
  asyncHandler(async (req, res) => {
    const transactions = transactionsRepo.list(req.merchant!.id, {
      status: req.query.status as never,
      order_id: req.query.order_id as string | undefined,
      invoice_id: req.query.invoice_id as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
    });
    res.json({ data: transactions });
  }),
);

transactionsRouter.get(
  "/transactions/:id",
  asyncHandler(async (req, res) => {
    const txn = transactionsRepo.findById(req.merchant!.id, req.params.id);
    if (!txn) throw new ApiError(404, "Transaction not found");
    res.json(txn);
  }),
);

transactionsRouter.post(
  "/transactions/:id/refund",
  asyncHandler(async (req, res) => {
    const merchantId = req.merchant!.id;
    const txn = transactionsRepo.findById(merchantId, req.params.id);
    if (!txn) throw new ApiError(404, "Transaction not found");
    if (txn.status !== "succeeded") {
      throw new ApiError(409, "Only a succeeded transaction can be refunded");
    }

    const result = await refund(txn.id);
    if (!result.succeeded) throw new ApiError(502, "Refund failed at processor");

    const updated = transactionsRepo.updateStatus(merchantId, txn.id, "refunded", {
      processor_reference: result.processor_reference,
    })!;

    eventBus.emitEvent("payment.refunded", merchantId, updated);
    res.json(updated);
  }),
);
