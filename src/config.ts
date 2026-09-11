export const config = {
  port: Number(process.env.PORT ?? 3000),
  dbPath: process.env.DB_PATH ?? "./data/dev.sqlite",
  webhookWorkerIntervalMs: Number(process.env.WEBHOOK_WORKER_INTERVAL_MS ?? 1000),
  webhookDeliveryTimeoutMs: Number(process.env.WEBHOOK_DELIVERY_TIMEOUT_MS ?? 5000),
  webhookReceiverPort: Number(process.env.WEBHOOK_RECEIVER_PORT ?? 4000),
  // Compressed backoff so retries are visible within a short demo session.
  webhookBackoffMs: [3000, 15000, 60000],
  webhookMaxAttempts: 5,
};
