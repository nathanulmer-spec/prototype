export type PaymentMethod = "card" | "ach";

export type TransactionStatus =
  | "pending"
  | "succeeded"
  | "failed"
  | "refunded"
  | "partially_refunded";

export interface Transaction {
  id: string;
  merchant_id: string;
  invoice_id: string | null;
  order_id: string | null;
  amount_cents: number;
  currency: string;
  payment_method: PaymentMethod;
  payment_method_last4: string | null;
  status: TransactionStatus;
  failure_reason: string | null;
  processor_reference: string | null;
  funding_batch_id: string | null;
  created_at: string;
  updated_at: string;
}
