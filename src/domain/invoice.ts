export type InvoiceStatus =
  | "open"
  | "partially_paid"
  | "paid"
  | "reconciled"
  | "void"
  | "overdue";

export interface Invoice {
  id: string;
  merchant_id: string;
  order_id: string | null;
  invoice_number: string;
  amount_due_cents: number;
  amount_paid_cents: number;
  currency: string;
  status: InvoiceStatus;
  due_date: string | null;
  reconciled_at: string | null;
  reconciled_transaction_id: string | null;
  created_at: string;
  updated_at: string;
}
