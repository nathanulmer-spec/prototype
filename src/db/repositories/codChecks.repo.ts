import { getDb } from "../client.js";
import { makeId } from "../../utils/ids.js";
import type { CodCheck, CodRiskStatus } from "../../domain/codCheck.js";
import type { PaymentMethod } from "../../domain/transaction.js";

export interface CreateCodCheckInput {
  merchant_id: string;
  order_id: string;
  payment_method: PaymentMethod;
  risk_status: CodRiskStatus;
  reason?: string | null;
  ttlMs: number;
}

export const codChecksRepo = {
  create(input: CreateCodCheckInput): CodCheck {
    const db = getDb();
    const now = new Date();
    const check: CodCheck = {
      id: makeId("cod"),
      merchant_id: input.merchant_id,
      order_id: input.order_id,
      payment_method: input.payment_method,
      risk_status: input.risk_status,
      reason: input.reason ?? null,
      checked_at: now.toISOString(),
      expires_at: new Date(now.getTime() + input.ttlMs).toISOString(),
      created_at: now.toISOString(),
    };
    db.prepare(
      `INSERT INTO cod_checks (
        id, merchant_id, order_id, payment_method, risk_status, reason, checked_at, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      check.id,
      check.merchant_id,
      check.order_id,
      check.payment_method,
      check.risk_status,
      check.reason,
      check.checked_at,
      check.expires_at,
      check.created_at,
    );
    return check;
  },

  findLatestForOrder(merchantId: string, orderId: string): CodCheck | undefined {
    const db = getDb();
    return db
      .prepare(
        `SELECT * FROM cod_checks WHERE merchant_id = ? AND order_id = ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(merchantId, orderId) as CodCheck | undefined;
  },
};
