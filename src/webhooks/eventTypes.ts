export const WEBHOOK_EVENT_TYPES = [
  "order.created",
  "order.dispatched",
  "payment.succeeded",
  "payment.failed",
  "payment.refunded",
  "payment.returned",
  "invoice.created",
  "invoice.reconciled",
  "cod.risk.updated",
  "funding.batch.deposited",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];
