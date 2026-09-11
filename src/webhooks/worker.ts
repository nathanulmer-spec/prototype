import { config } from "../config.js";
import { webhookDeliveriesRepo } from "../db/repositories/webhookDeliveries.repo.js";
import { webhookSubscriptionsRepo } from "../db/repositories/webhookSubscriptions.repo.js";
import { attemptDelivery } from "./deliverer.js";
import { logger } from "../utils/logger.js";

let timer: NodeJS.Timeout | null = null;

async function drainOnce() {
  const due = webhookDeliveriesRepo.listDue(new Date().toISOString());

  for (const delivery of due) {
    const subscription = webhookSubscriptionsRepo.findById(
      delivery.merchant_id,
      delivery.subscription_id,
    );
    if (!subscription) continue;

    const outcome = await attemptDelivery(delivery, subscription);
    webhookDeliveriesRepo.recordAttempt(delivery.id, {
      status: outcome.status,
      response_status_code: outcome.responseStatusCode,
      response_body_snippet: outcome.responseBodySnippet,
      next_attempt_at: outcome.nextAttemptAt,
    });
    logger.info(`Webhook delivery attempt`, {
      delivery: delivery.id,
      event: delivery.event_type,
      result: outcome.status,
      http_status: outcome.responseStatusCode,
    });
  }
}

export function startWebhookWorker() {
  if (timer) return;
  timer = setInterval(() => {
    drainOnce().catch((err) => logger.error("Webhook worker tick failed", { err }));
  }, config.webhookWorkerIntervalMs);
  logger.info("Webhook delivery worker started", { intervalMs: config.webhookWorkerIntervalMs });
}

export function stopWebhookWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
