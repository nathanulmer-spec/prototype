import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { webhookSubscriptionsRepo } from "../../db/repositories/webhookSubscriptions.repo.js";
import { webhookDeliveriesRepo } from "../../db/repositories/webhookDeliveries.repo.js";
import { WEBHOOK_EVENT_TYPES } from "../../webhooks/eventTypes.js";
import { eventBus } from "../../webhooks/eventBus.js";
import { asyncHandler, validateBody } from "../../middleware/validate.js";
import { ApiError } from "../../middleware/errorHandler.js";

export const webhooksRouter = Router();

const createSubscriptionSchema = z.object({
  target_url: z.string().url(),
  event_types: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1),
});

webhooksRouter.post(
  "/webhooks/subscriptions",
  validateBody(createSubscriptionSchema),
  asyncHandler(async (req, res) => {
    const subscription = webhookSubscriptionsRepo.create({
      merchant_id: req.merchant!.id,
      target_url: req.body.target_url,
      event_types: req.body.event_types,
      signing_secret: `whsec_${randomBytes(24).toString("hex")}`,
    });
    res.status(201).json(subscription);
  }),
);

webhooksRouter.get(
  "/webhooks/subscriptions",
  asyncHandler(async (req, res) => {
    res.json({ data: webhookSubscriptionsRepo.list(req.merchant!.id) });
  }),
);

webhooksRouter.get(
  "/webhooks/subscriptions/:id",
  asyncHandler(async (req, res) => {
    const sub = webhookSubscriptionsRepo.findById(req.merchant!.id, req.params.id);
    if (!sub) throw new ApiError(404, "Webhook subscription not found");
    res.json(sub);
  }),
);

const updateSubscriptionSchema = z.object({ status: z.enum(["active", "disabled"]) });

webhooksRouter.patch(
  "/webhooks/subscriptions/:id",
  validateBody(updateSubscriptionSchema),
  asyncHandler(async (req, res) => {
    const sub = webhookSubscriptionsRepo.updateStatus(
      req.merchant!.id,
      req.params.id,
      req.body.status,
    );
    if (!sub) throw new ApiError(404, "Webhook subscription not found");
    res.json(sub);
  }),
);

webhooksRouter.delete(
  "/webhooks/subscriptions/:id",
  asyncHandler(async (req, res) => {
    const deleted = webhookSubscriptionsRepo.delete(req.merchant!.id, req.params.id);
    if (!deleted) throw new ApiError(404, "Webhook subscription not found");
    res.status(204).send();
  }),
);

webhooksRouter.get(
  "/webhooks/deliveries",
  asyncHandler(async (req, res) => {
    const deliveries = webhookDeliveriesRepo.list(req.merchant!.id, {
      subscription_id: req.query.subscription_id as string | undefined,
      status: req.query.status as never,
      event_type: req.query.event_type as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
    });
    res.json({ data: deliveries });
  }),
);

webhooksRouter.get(
  "/webhooks/deliveries/:id",
  asyncHandler(async (req, res) => {
    const delivery = webhookDeliveriesRepo.findById(req.merchant!.id, req.params.id);
    if (!delivery) throw new ApiError(404, "Webhook delivery not found");
    res.json(delivery);
  }),
);

webhooksRouter.post(
  "/webhooks/deliveries/:id/retry",
  asyncHandler(async (req, res) => {
    const delivery = webhookDeliveriesRepo.resetForRetry(req.merchant!.id, req.params.id);
    if (!delivery) throw new ApiError(404, "Webhook delivery not found");
    res.json(delivery);
  }),
);

webhooksRouter.post(
  "/webhooks/test-ping",
  asyncHandler(async (req, res) => {
    const envelope = eventBus.emitEvent("order.created", req.merchant!.id, {
      message: "This is a test ping from Fractal Pay's merchant API.",
    });
    res.status(202).json({ queued_event: envelope });
  }),
);
