import { Router } from "express";
import { z } from "zod";
import { notificationRulesRepo } from "../../db/repositories/notificationRules.repo.js";
import { notificationLogRepo } from "../../db/repositories/notificationLog.repo.js";
import { sendNotification } from "../../mock/notifier.js";
import { WEBHOOK_EVENT_TYPES } from "../../webhooks/eventTypes.js";
import { asyncHandler, validateBody } from "../../middleware/validate.js";
import { ApiError } from "../../middleware/errorHandler.js";

export const notificationsRouter = Router();

const createRuleSchema = z.object({
  customer_id: z.string().min(1),
  customer_name: z.string().min(1),
  channel: z.enum(["email", "sms"]),
  destination: z.string().min(1),
  event_type: z.enum(WEBHOOK_EVENT_TYPES),
});

notificationsRouter.post(
  "/notifications/rules",
  validateBody(createRuleSchema),
  asyncHandler(async (req, res) => {
    const rule = notificationRulesRepo.create({ merchant_id: req.merchant!.id, ...req.body });
    res.status(201).json(rule);
  }),
);

notificationsRouter.get(
  "/notifications/rules",
  asyncHandler(async (req, res) => {
    res.json({ data: notificationRulesRepo.list(req.merchant!.id) });
  }),
);

const updateRuleSchema = z.object({ status: z.enum(["active", "disabled"]) });

notificationsRouter.patch(
  "/notifications/rules/:id",
  validateBody(updateRuleSchema),
  asyncHandler(async (req, res) => {
    const rule = notificationRulesRepo.updateStatus(req.merchant!.id, req.params.id, req.body.status);
    if (!rule) throw new ApiError(404, "Notification rule not found");
    res.json(rule);
  }),
);

notificationsRouter.delete(
  "/notifications/rules/:id",
  asyncHandler(async (req, res) => {
    const deleted = notificationRulesRepo.delete(req.merchant!.id, req.params.id);
    if (!deleted) throw new ApiError(404, "Notification rule not found");
    res.status(204).send();
  }),
);

notificationsRouter.post(
  "/notifications/rules/:id/test",
  asyncHandler(async (req, res) => {
    const rule = notificationRulesRepo.findById(req.merchant!.id, req.params.id);
    if (!rule) throw new ApiError(404, "Notification rule not found");

    const message = `Test notification for ${rule.customer_name}: this is what a "${rule.event_type}" alert would look like.`;
    const result = await sendNotification({ channel: rule.channel, destination: rule.destination, message });

    const entry = notificationLogRepo.create({
      merchant_id: req.merchant!.id,
      rule_id: rule.id,
      event_type: rule.event_type,
      channel: rule.channel,
      destination: rule.destination,
      message,
    });

    res.status(201).json({ ...entry, sent: result.sent });
  }),
);

notificationsRouter.get(
  "/notifications/log",
  asyncHandler(async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    res.json({ data: notificationLogRepo.list(req.merchant!.id, limit) });
  }),
);
