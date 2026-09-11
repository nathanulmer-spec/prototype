import { EventEmitter } from "node:events";
import { makeId } from "../utils/ids.js";
import type { WebhookEventEnvelope } from "../domain/webhook.js";
import type { WebhookEventType } from "./eventTypes.js";

class WebhookEventBus extends EventEmitter {
  emitEvent<T>(type: WebhookEventType, merchantId: string, data: T): WebhookEventEnvelope<T> {
    const envelope: WebhookEventEnvelope<T> = {
      id: makeId("evt"),
      type,
      created_at: new Date().toISOString(),
      merchant_id: merchantId,
      data,
    };
    this.emit(type, envelope);
    this.emit("*", envelope);
    return envelope;
  }
}

export const eventBus = new WebhookEventBus();
