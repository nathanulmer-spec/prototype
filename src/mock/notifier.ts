import type { NotificationChannel } from "../domain/notification.js";

export interface SendNotificationInput {
  channel: NotificationChannel;
  destination: string;
  message: string;
}

export interface SendNotificationResult {
  sent: boolean;
  provider_reference: string;
}

/**
 * Stands in for a real email/SMS provider (SendGrid, Twilio, etc). Always
 * "succeeds" — there's no real delivery to fail — but logs so the console
 * shows what a merchant's customer would have actually received.
 */
export async function sendNotification(input: SendNotificationInput): Promise<SendNotificationResult> {
  const channelLabel = input.channel === "sms" ? "SMS" : "Email";
  console.log(`[mock ${channelLabel} notification] to ${input.destination}: "${input.message}"`);
  return { sent: true, provider_reference: `sim_notif_${Math.random().toString(36).slice(2, 10)}` };
}
