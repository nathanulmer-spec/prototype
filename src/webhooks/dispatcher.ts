import { eventBus } from "./eventBus.js";
import { webhookSubscriptionsRepo } from "../db/repositories/webhookSubscriptions.repo.js";
import { webhookDeliveriesRepo } from "../db/repositories/webhookDeliveries.repo.js";
import { logger } from "../utils/logger.js";
import type { WebhookEventEnvelope } from "../domain/webhook.js";

/**
 * Fans a single emitted event out to every active subscription that's
 * interested in it, queuing one webhook_deliveries row per subscription.
 */
export function startDispatcher() {
  eventBus.on("*", (envelope: WebhookEventEnvelope) => {
    const subscriptions = webhookSubscriptionsRepo.listActiveForEvent(
      envelope.merchant_id,
      envelope.type,
    );

    for (const subscription of subscriptions) {
      webhookDeliveriesRepo.create({
        subscription_id: subscription.id,
        merchant_id: envelope.merchant_id,
        event_type: envelope.type,
        event_id: envelope.id,
        payload: JSON.stringify(envelope),
      });
      logger.info(`Queued webhook delivery`, {
        event: envelope.type,
        subscription: subscription.id,
      });
    }
  });
}
