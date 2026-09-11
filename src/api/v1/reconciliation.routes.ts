import { Router } from "express";
import { z } from "zod";
import { transactionsRepo } from "../../db/repositories/transactions.repo.js";
import { invoicesRepo } from "../../db/repositories/invoices.repo.js";
import { eventBus } from "../../webhooks/eventBus.js";
import { buildReconciliationReport } from "../../tools/reconciliation/reconciliationReport.js";
import { asyncHandler, validateBody } from "../../middleware/validate.js";
import { ApiError } from "../../middleware/errorHandler.js";

export const reconciliationRouter = Router();

reconciliationRouter.get(
  "/reconciliation/report",
  asyncHandler(async (req, res) => {
    res.json(buildReconciliationReport(req.merchant!.id));
  }),
);

reconciliationRouter.get(
  "/reconciliation/unmatched",
  asyncHandler(async (req, res) => {
    res.json({ data: transactionsRepo.listUnmatched(req.merchant!.id) });
  }),
);

const matchSchema = z.object({
  transaction_id: z.string().min(1),
  invoice_id: z.string().min(1),
});

reconciliationRouter.post(
  "/reconciliation/match",
  validateBody(matchSchema),
  asyncHandler(async (req, res) => {
    const merchantId = req.merchant!.id;
    const txn = transactionsRepo.findById(merchantId, req.body.transaction_id);
    if (!txn) throw new ApiError(404, "Transaction not found");
    if (txn.status !== "succeeded") throw new ApiError(409, "Only succeeded transactions can be matched");

    const invoice = invoicesRepo.findById(merchantId, req.body.invoice_id);
    if (!invoice) throw new ApiError(404, "Invoice not found");

    transactionsRepo.linkInvoice(merchantId, txn.id, invoice.id);
    const updated = invoicesRepo.applyPayment(merchantId, invoice.id, txn.amount_cents, txn.id);

    if (updated?.status === "reconciled") {
      eventBus.emitEvent("invoice.reconciled", merchantId, updated);
    }

    res.json(updated);
  }),
);
