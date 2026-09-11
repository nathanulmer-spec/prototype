import express from "express";
import { config } from "../src/config.js";
import { webhookSubscriptionsRepo } from "../src/db/repositories/webhookSubscriptions.repo.js";
import { verifySignature } from "../src/webhooks/signer.js";
import { logger } from "../src/utils/logger.js";
import type { WebhookEventEnvelope } from "../src/domain/webhook.js";

/**
 * Stands in for a merchant's own server receiving Fractal Pay webhooks.
 * Verifies the HMAC signature before trusting the payload, exactly as a real
 * integration would.
 */
const app = express();
app.use(express.text({ type: "*/*" }));

app.post("/webhook", (req, res) => {
  const rawBody = req.body as string;
  const signatureHeader = req.header("x-fractalpay-signature");
  const subscriptionId = req.header("x-fractalpay-subscription-id");

  let envelope: WebhookEventEnvelope;
  try {
    envelope = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: "invalid JSON" });
  }

  if (!signatureHeader || !subscriptionId) {
    return res.status(400).json({ error: "missing signature headers" });
  }

  const subscription = webhookSubscriptionsRepo.findById(envelope.merchant_id, subscriptionId);
  if (!subscription) {
    return res.status(400).json({ error: "unknown subscription" });
  }

  const valid = verifySignature(subscription.signing_secret, rawBody, signatureHeader);
  if (!valid) {
    logger.warn("Rejected webhook with invalid signature", { event: envelope.type });
    return res.status(400).json({ error: "invalid signature" });
  }

  logger.info(`Verified webhook received: ${envelope.type}`, {
    event_id: envelope.id,
    data: envelope.data,
  });

  res.status(200).json({ received: true });
});

app.listen(config.webhookReceiverPort, () => {
  logger.info(`Webhook receiver listening on port ${config.webhookReceiverPort} (POST /webhook)`);
});
