import { getDb } from "../client.js";
import { makeId } from "../../utils/ids.js";
import type { WebhookDelivery, WebhookDeliveryStatus } from "../../domain/webhook.js";

export interface CreateWebhookDeliveryInput {
  subscription_id: string;
  merchant_id: string;
  event_type: string;
  event_id: string;
  payload: string;
}

export interface WebhookDeliveryListFilters {
  subscription_id?: string;
  status?: WebhookDeliveryStatus;
  event_type?: string;
  limit?: number;
  offset?: number;
}

export const webhookDeliveriesRepo = {
  create(input: CreateWebhookDeliveryInput): WebhookDelivery {
    const db = getDb();
    const now = new Date().toISOString();
    const delivery: WebhookDelivery = {
      id: makeId("whd"),
      subscription_id: input.subscription_id,
      merchant_id: input.merchant_id,
      event_type: input.event_type,
      event_id: input.event_id,
      payload: input.payload,
      attempt_count: 0,
      status: "pending",
      last_attempt_at: null,
      next_attempt_at: now,
      response_status_code: null,
      response_body_snippet: null,
      created_at: now,
    };
    db.prepare(
      `INSERT INTO webhook_deliveries (
        id, subscription_id, merchant_id, event_type, event_id, payload,
        attempt_count, status, last_attempt_at, next_attempt_at,
        response_status_code, response_body_snippet, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      delivery.id,
      delivery.subscription_id,
      delivery.merchant_id,
      delivery.event_type,
      delivery.event_id,
      delivery.payload,
      delivery.attempt_count,
      delivery.status,
      delivery.last_attempt_at,
      delivery.next_attempt_at,
      delivery.response_status_code,
      delivery.response_body_snippet,
      delivery.created_at,
    );
    return delivery;
  },

  findById(merchantId: string, id: string): WebhookDelivery | undefined {
    const db = getDb();
    return db
      .prepare(`SELECT * FROM webhook_deliveries WHERE id = ? AND merchant_id = ?`)
      .get(id, merchantId) as WebhookDelivery | undefined;
  },

  list(merchantId: string, filters: WebhookDeliveryListFilters = {}): WebhookDelivery[] {
    const db = getDb();
    const clauses = ["merchant_id = ?"];
    const params: (string | number)[] = [merchantId];

    if (filters.subscription_id) {
      clauses.push("subscription_id = ?");
      params.push(filters.subscription_id);
    }
    if (filters.status) {
      clauses.push("status = ?");
      params.push(filters.status);
    }
    if (filters.event_type) {
      clauses.push("event_type = ?");
      params.push(filters.event_type);
    }

    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    return db
      .prepare(
        `SELECT * FROM webhook_deliveries WHERE ${clauses.join(" AND ")}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as unknown as WebhookDelivery[];
  },

  listDue(nowIso: string, limit = 25): WebhookDelivery[] {
    const db = getDb();
    return db
      .prepare(
        `SELECT * FROM webhook_deliveries
         WHERE status = 'pending' AND next_attempt_at <= ?
         ORDER BY next_attempt_at LIMIT ?`,
      )
      .all(nowIso, limit) as unknown as WebhookDelivery[];
  },

  recordAttempt(
    id: string,
    result: {
      status: WebhookDeliveryStatus;
      response_status_code: number | null;
      response_body_snippet: string | null;
      next_attempt_at: string;
    },
  ): void {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE webhook_deliveries
       SET attempt_count = attempt_count + 1, status = ?, last_attempt_at = ?,
           next_attempt_at = ?, response_status_code = ?, response_body_snippet = ?
       WHERE id = ?`,
    ).run(
      result.status,
      now,
      result.next_attempt_at,
      result.response_status_code,
      result.response_body_snippet,
      id,
    );
  },

  resetForRetry(merchantId: string, id: string): WebhookDelivery | undefined {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE webhook_deliveries SET status = 'pending', next_attempt_at = ? WHERE id = ? AND merchant_id = ?`,
    ).run(now, id, merchantId);
    return this.findById(merchantId, id);
  },
};
