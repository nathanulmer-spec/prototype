import { getDb } from "../client.js";
import { makeId } from "../../utils/ids.js";
import type { NotificationChannel, NotificationLogEntry } from "../../domain/notification.js";

export interface CreateNotificationLogInput {
  merchant_id: string;
  rule_id: string;
  event_type: string;
  channel: NotificationChannel;
  destination: string;
  message: string;
}

export const notificationLogRepo = {
  create(input: CreateNotificationLogInput): NotificationLogEntry {
    const db = getDb();
    const entry: NotificationLogEntry = {
      id: makeId("ntl"),
      merchant_id: input.merchant_id,
      rule_id: input.rule_id,
      event_type: input.event_type,
      channel: input.channel,
      destination: input.destination,
      message: input.message,
      created_at: new Date().toISOString(),
    };
    db.prepare(
      `INSERT INTO notification_log (id, merchant_id, rule_id, event_type, channel, destination, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      entry.id,
      entry.merchant_id,
      entry.rule_id,
      entry.event_type,
      entry.channel,
      entry.destination,
      entry.message,
      entry.created_at,
    );
    return entry;
  },

  list(merchantId: string, limit = 50): NotificationLogEntry[] {
    const db = getDb();
    return db
      .prepare(
        `SELECT * FROM notification_log WHERE merchant_id = ? ORDER BY created_at DESC LIMIT ?`,
      )
      .all(merchantId, limit) as unknown as NotificationLogEntry[];
  },
};
