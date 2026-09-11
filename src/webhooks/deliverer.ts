import { config } from "../config.js";
import { postJsonWithTimeout } from "../utils/http.js";
import { signPayload } from "./signer.js";
import type { WebhookDelivery, WebhookDeliveryStatus } from "../domain/webhook.js";
import type { WebhookSubscription } from "../domain/webhook.js";

export interface DeliveryOutcome {
  status: WebhookDeliveryStatus;
  responseStatusCode: number | null;
  responseBodySnippet: string | null;
  nextAttemptAt: string;
}

export async function attemptDelivery(
  delivery: WebhookDelivery,
  subscription: WebhookSubscription,
): Promise<DeliveryOutcome> {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signPayload(subscription.signing_secret, delivery.payload, timestamp);

  const result = await postJsonWithTimeout(
    subscription.target_url,
    delivery.payload,
    {
      "x-fractalpay-signature": signature,
      "x-fractalpay-event": delivery.event_type,
      "x-fractalpay-subscription-id": subscription.id,
    },
    config.webhookDeliveryTimeoutMs,
  );

  const attemptNumber = delivery.attempt_count + 1;

  if (result.ok) {
    return {
      status: "delivered",
      responseStatusCode: result.status,
      responseBodySnippet: result.bodySnippet,
      nextAttemptAt: new Date().toISOString(),
    };
  }

  const exhausted = attemptNumber >= config.webhookMaxAttempts;
  const backoffMs =
    config.webhookBackoffMs[Math.min(attemptNumber - 1, config.webhookBackoffMs.length - 1)];

  return {
    status: exhausted ? "exhausted" : "pending",
    responseStatusCode: result.status,
    responseBodySnippet: result.bodySnippet,
    nextAttemptAt: new Date(Date.now() + backoffMs).toISOString(),
  };
}
