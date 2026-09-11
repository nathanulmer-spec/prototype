import { Router } from "express";
import { z } from "zod";
import { invoicesRepo } from "../../db/repositories/invoices.repo.js";
import { eventBus } from "../../webhooks/eventBus.js";
import { asyncHandler, validateBody } from "../../middleware/validate.js";
import { ApiError } from "../../middleware/errorHandler.js";

export const invoicesRouter = Router();

const createInvoiceSchema = z.object({
  order_id: z.string().optional(),
  invoice_number: z.string().min(1),
  amount_due_cents: z.number().int().positive(),
  currency: z.string().length(3).optional(),
  due_date: z.string().datetime().optional(),
});

invoicesRouter.post(
  "/invoices",
  validateBody(createInvoiceSchema),
  asyncHandler(async (req, res) => {
    const invoice = invoicesRepo.create({ merchant_id: req.merchant!.id, ...req.body });
    eventBus.emitEvent("invoice.created", invoice.merchant_id, invoice);
    res.status(201).json(invoice);
  }),
);

invoicesRouter.get(
  "/invoices",
  asyncHandler(async (req, res) => {
    const invoices = invoicesRepo.list(req.merchant!.id, {
      status: req.query.status as never,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
    });
    res.json({ data: invoices });
  }),
);

invoicesRouter.get(
  "/invoices/:id",
  asyncHandler(async (req, res) => {
    const invoice = invoicesRepo.findById(req.merchant!.id, req.params.id);
    if (!invoice) throw new ApiError(404, "Invoice not found");
    res.json(invoice);
  }),
);

const reconcileSchema = z.object({ transaction_id: z.string().min(1) });

invoicesRouter.post(
  "/invoices/:id/reconcile",
  validateBody(reconcileSchema),
  asyncHandler(async (req, res) => {
    const invoice = invoicesRepo.markReconciled(
      req.merchant!.id,
      req.params.id,
      req.body.transaction_id,
    );
    if (!invoice) throw new ApiError(404, "Invoice not found");
    eventBus.emitEvent("invoice.reconciled", invoice.merchant_id, invoice);
    res.json(invoice);
  }),
);
