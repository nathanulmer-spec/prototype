import { getDb } from "../client.js";
import { makeId } from "../../utils/ids.js";
import type { NotificationChannel, NotificationRule, NotificationRuleStatus } from "../../domain/notification.js";

export interface CreateNotificationRuleInput {
  merchant_id: string;
  customer_id: string;
  customer_name: string;
  channel: NotificationChannel;
  destination: string;
  event_type: string;
}

export const notificationRulesRepo = {
  create(input: CreateNotificationRuleInput): NotificationRule {
    const db = getDb();
    const rule: NotificationRule = {
      id: makeId("ntr"),
      merchant_id: input.merchant_id,
      customer_id: input.customer_id,
      customer_name: input.customer_name,
      channel: input.channel,
      destination: input.destination,
      event_type: input.event_type,
      status: "active",
      created_at: new Date().toISOString(),
    };
    db.prepare(
      `INSERT INTO notification_rules (
        id, merchant_id, customer_id, customer_name, channel, destination, event_type, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      rule.id,
      rule.merchant_id,
      rule.customer_id,
      rule.customer_name,
      rule.channel,
      rule.destination,
      rule.event_type,
      rule.status,
      rule.created_at,
    );
    return rule;
  },

  findById(merchantId: string, id: string): NotificationRule | undefined {
    const db = getDb();
    return db
      .prepare(`SELECT * FROM notification_rules WHERE id = ? AND merchant_id = ?`)
      .get(id, merchantId) as NotificationRule | undefined;
  },

  list(merchantId: string): NotificationRule[] {
    const db = getDb();
    return db
      .prepare(`SELECT * FROM notification_rules WHERE merchant_id = ? ORDER BY created_at DESC`)
      .all(merchantId) as unknown as NotificationRule[];
  },

  listActiveForCustomerEvent(merchantId: string, customerId: string, eventType: string): NotificationRule[] {
    const db = getDb();
    return db
      .prepare(
        `SELECT * FROM notification_rules
         WHERE merchant_id = ? AND customer_id = ? AND event_type = ? AND status = 'active'`,
      )
      .all(merchantId, customerId, eventType) as unknown as NotificationRule[];
  },

  updateStatus(merchantId: string, id: string, status: NotificationRuleStatus): NotificationRule | undefined {
    const db = getDb();
    db.prepare(`UPDATE notification_rules SET status = ? WHERE id = ? AND merchant_id = ?`).run(
      status,
      id,
      merchantId,
    );
    return this.findById(merchantId, id);
  },

  delete(merchantId: string, id: string): boolean {
    const db = getDb();
    const result = db
      .prepare(`DELETE FROM notification_rules WHERE id = ? AND merchant_id = ?`)
      .run(id, merchantId);
    return result.changes > 0;
  },
};
