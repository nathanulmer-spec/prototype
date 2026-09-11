import type { PaymentMethod } from "./transaction.js";

export type CodRiskStatus = "pending" | "cleared" | "hold" | "declined";

export interface CodCheck {
  id: string;
  merchant_id: string;
  order_id: string;
  payment_method: PaymentMethod;
  risk_status: CodRiskStatus;
  reason: string | null;
  checked_at: string;
  expires_at: string;
  created_at: string;
}
