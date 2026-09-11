export type WebhookSubscriptionStatus = "active" | "disabled";

export interface WebhookSubscription {
  id: string;
  merchant_id: string;
  target_url: string;
  event_types: string[];
  signing_secret: string;
  status: WebhookSubscriptionStatus;
  created_at: string;
}

export type WebhookDeliveryStatus = "pending" | "delivered" | "failed" | "exhausted";

export interface WebhookDelivery {
  id: string;
  subscription_id: string;
  merchant_id: string;
  event_type: string;
  event_id: string;
  payload: string;
  attempt_count: number;
  status: WebhookDeliveryStatus;
  last_attempt_at: string | null;
  next_attempt_at: string;
  response_status_code: number | null;
  response_body_snippet: string | null;
  created_at: string;
}

export interface WebhookEventEnvelope<T = unknown> {
  id: string;
  type: string;
  created_at: string;
  merchant_id: string;
  data: T;
}
