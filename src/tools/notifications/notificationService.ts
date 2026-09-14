import { eventBus } from "../../webhooks/eventBus.js";
import { ordersRepo } from "../../db/repositories/orders.repo.js";
import { notificationRulesRepo } from "../../db/repositories/notificationRules.repo.js";
import { notificationLogRepo } from "../../db/repositories/notificationLog.repo.js";
import { sendNotification } from "../../mock/notifier.js";
import { logger } from "../../utils/logger.js";
import type { WebhookEventEnvelope } from "../../domain/webhook.js";

interface TransactionLikeEventData {
  order_id?: string | null;
  amount_cents?: number;
  payment_method?: string;
  failure_reason?: string | null;
  return_reason?: string;
}

function formatMessage(eventType: string, data: TransactionLikeEventData, materialDescription: string): string {
  const amount = data.amount_cents != null ? `$${(data.amount_cents / 100).toFixed(2)}` : "a payment";
  switch (eventType) {
    case "payment.succeeded":
      return `Payment of ${amount} (${data.payment_method}) received for your order (${materialDescription}). Thank you!`;
    case "payment.failed":
      return `A payment attempt of ${amount} for your order (${materialDescription}) failed${data.failure_reason ? `: ${data.failure_reason}` : "."}`;
    case "payment.refunded":
      return `Your payment of ${amount} for order (${materialDescription}) has been refunded.`;
    case "payment.returned":
      return `A payment of ${amount} for order (${materialDescription}) was returned by the bank${data.return_reason ? ` (${data.return_reason})` : ""}. Please contact us to arrange payment.`;
    default:
      return `Update on your order (${materialDescription}): ${eventType}`;
  }
}

/**
 * Simulates per-customer notifications (email/SMS) layered on top of the
 * same webhook event bus merchants can subscribe to. This is what a merchant
 * could build with the merchant-layer API: alerting a specific customer
 * directly instead of just logging events for their own systems.
 */
export function startNotificationService() {
  eventBus.on("*", (envelope: WebhookEventEnvelope<TransactionLikeEventData>) => {
    const orderId = envelope.data?.order_id;
    if (!orderId) return;

    const order = ordersRepo.findById(envelope.merchant_id, orderId);
    if (!order) return;

    const rules = notificationRulesRepo.listActiveForCustomerEvent(
      envelope.merchant_id,
      order.customer_id,
      envelope.type,
    );

    for (const rule of rules) {
      const message = formatMessage(envelope.type, envelope.data, order.material_description);

      sendNotification({ channel: rule.channel, destination: rule.destination, message })
        .then((result) => {
          if (!result.sent) return;
          notificationLogRepo.create({
            merchant_id: envelope.merchant_id,
            rule_id: rule.id,
            event_type: envelope.type,
            channel: rule.channel,
            destination: rule.destination,
            message,
          });
        })
        .catch((err) => logger.error("Notification send failed", { err, rule: rule.id }));
    }
  });
}
