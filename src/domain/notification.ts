export type NotificationChannel = "email" | "sms";
export type NotificationRuleStatus = "active" | "disabled";

export interface NotificationRule {
  id: string;
  merchant_id: string;
  customer_id: string;
  customer_name: string;
  channel: NotificationChannel;
  destination: string;
  event_type: string;
  status: NotificationRuleStatus;
  created_at: string;
}

export interface NotificationLogEntry {
  id: string;
  merchant_id: string;
  rule_id: string;
  event_type: string;
  channel: NotificationChannel;
  destination: string;
  message: string;
  created_at: string;
}
