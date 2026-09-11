import { getDb } from "../client.js";
import { makeId } from "../../utils/ids.js";
import type { WebhookSubscription, WebhookSubscriptionStatus } from "../../domain/webhook.js";

interface WebhookSubscriptionRow extends Omit<WebhookSubscription, "event_types"> {
  event_types: string;
}

function rowToSubscription(row: WebhookSubscriptionRow): WebhookSubscription {
  return { ...row, event_types: JSON.parse(row.event_types) };
}

export interface CreateWebhookSubscriptionInput {
  merchant_id: string;
  target_url: string;
  event_types: string[];
  signing_secret: string;
}

export const webhookSubscriptionsRepo = {
  create(input: CreateWebhookSubscriptionInput): WebhookSubscription {
    const db = getDb();
    const now = new Date().toISOString();
    const sub: WebhookSubscription = {
      id: makeId("whs"),
      merchant_id: input.merchant_id,
      target_url: input.target_url,
      event_types: input.event_types,
      signing_secret: input.signing_secret,
      status: "active",
      created_at: now,
    };
    db.prepare(
      `INSERT INTO webhook_subscriptions (id, merchant_id, target_url, event_types, signing_secret, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      sub.id,
      sub.merchant_id,
      sub.target_url,
      JSON.stringify(sub.event_types),
      sub.signing_secret,
      sub.status,
      sub.created_at,
    );
    return sub;
  },

  findById(merchantId: string, id: string): WebhookSubscription | undefined {
    const db = getDb();
    const row = db
      .prepare(`SELECT * FROM webhook_subscriptions WHERE id = ? AND merchant_id = ?`)
      .get(id, merchantId) as WebhookSubscriptionRow | undefined;
    return row ? rowToSubscription(row) : undefined;
  },

  list(merchantId: string): WebhookSubscription[] {
    const db = getDb();
    const rows = db
      .prepare(`SELECT * FROM webhook_subscriptions WHERE merchant_id = ? ORDER BY created_at DESC`)
      .all(merchantId) as unknown as WebhookSubscriptionRow[];
    return rows.map(rowToSubscription);
  },

  listActiveForEvent(merchantId: string, eventType: string): WebhookSubscription[] {
    const db = getDb();
    const rows = db
      .prepare(`SELECT * FROM webhook_subscriptions WHERE merchant_id = ? AND status = 'active'`)
      .all(merchantId) as unknown as WebhookSubscriptionRow[];
    return rows.map(rowToSubscription).filter((s) => s.event_types.includes(eventType));
  },

  updateStatus(
    merchantId: string,
    id: string,
    status: WebhookSubscriptionStatus,
  ): WebhookSubscription | undefined {
    const db = getDb();
    db.prepare(`UPDATE webhook_subscriptions SET status = ? WHERE id = ? AND merchant_id = ?`).run(
      status,
      id,
      merchantId,
    );
    return this.findById(merchantId, id);
  },

  delete(merchantId: string, id: string): boolean {
    const db = getDb();
    const result = db
      .prepare(`DELETE FROM webhook_subscriptions WHERE id = ? AND merchant_id = ?`)
      .run(id, merchantId);
    return result.changes > 0;
  },
};
