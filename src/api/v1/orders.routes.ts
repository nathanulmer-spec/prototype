import { Router } from "express";
import { z } from "zod";
import { ordersRepo } from "../../db/repositories/orders.repo.js";
import { codChecksRepo } from "../../db/repositories/codChecks.repo.js";
import { performPreDeliveryCheck, isDispatchClearedForCod } from "../../tools/codRisk/codRiskService.js";
import { eventBus } from "../../webhooks/eventBus.js";
import { asyncHandler, validateBody } from "../../middleware/validate.js";
import { ApiError } from "../../middleware/errorHandler.js";

export const ordersRouter = Router();

const createOrderSchema = z.object({
  external_ca_order_number: z.string().optional(),
  customer_name: z.string().min(1),
  customer_id: z.string().min(1),
  delivery_address: z.string().min(1),
  material_description: z.string().min(1),
  amount_due_cents: z.number().int().positive(),
  currency: z.string().length(3).optional(),
  order_type: z.enum(["cod", "invoice_terms", "prepaid"]),
  requested_delivery_at: z.string().datetime().optional(),
});

ordersRouter.post(
  "/orders",
  validateBody(createOrderSchema),
  asyncHandler(async (req, res) => {
    const order = ordersRepo.create({ merchant_id: req.merchant!.id, ...req.body });
    eventBus.emitEvent("order.created", order.merchant_id, order);
    res.status(201).json(order);
  }),
);

ordersRouter.get(
  "/orders",
  asyncHandler(async (req, res) => {
    const orders = ordersRepo.list(req.merchant!.id, {
      status: req.query.status as never,
      customer_id: req.query.customer_id as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
    });
    res.json({ data: orders });
  }),
);

ordersRouter.get(
  "/orders/:id",
  asyncHandler(async (req, res) => {
    const order = ordersRepo.findById(req.merchant!.id, req.params.id);
    if (!order) throw new ApiError(404, "Order not found");
    res.json(order);
  }),
);

const updateStatusSchema = z.object({
  status: z.enum([
    "created",
    "cod_check_pending",
    "cod_cleared",
    "cod_hold",
    "dispatched",
    "delivered",
    "invoiced",
    "paid",
    "cancelled",
  ]),
});

ordersRouter.patch(
  "/orders/:id/status",
  validateBody(updateStatusSchema),
  asyncHandler(async (req, res) => {
    const order = ordersRepo.updateStatus(req.merchant!.id, req.params.id, req.body.status);
    if (!order) throw new ApiError(404, "Order not found");
    res.json(order);
  }),
);

const codCheckSchema = z.object({
  payment_method: z.enum(["card", "ach"]),
});

ordersRouter.post(
  "/orders/:id/cod-check",
  validateBody(codCheckSchema),
  asyncHandler(async (req, res) => {
    const check = await performPreDeliveryCheck({
      merchant_id: req.merchant!.id,
      order_id: req.params.id,
      payment_method: req.body.payment_method,
    });
    res.status(201).json(check);
  }),
);

ordersRouter.get(
  "/orders/:id/cod-check",
  asyncHandler(async (req, res) => {
    const check = codChecksRepo.findLatestForOrder(req.merchant!.id, req.params.id);
    if (!check) throw new ApiError(404, "No COD check found for this order");
    res.json(check);
  }),
);

ordersRouter.post(
  "/orders/:id/dispatch",
  asyncHandler(async (req, res) => {
    const order = ordersRepo.findById(req.merchant!.id, req.params.id);
    if (!order) throw new ApiError(404, "Order not found");

    if (order.order_type === "cod") {
      const check = codChecksRepo.findLatestForOrder(req.merchant!.id, order.id);
      const { cleared, reason } = isDispatchClearedForCod(check);
      if (!cleared) {
        return res.status(409).json({ error: { message: `Dispatch blocked: ${reason}` } });
      }
    }

    const updated = ordersRepo.updateStatus(req.merchant!.id, order.id, "dispatched");
    eventBus.emitEvent("order.dispatched", req.merchant!.id, updated);
    res.json(updated);
  }),
);
