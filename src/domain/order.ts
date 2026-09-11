export type OrderType = "cod" | "invoice_terms" | "prepaid";

export type OrderStatus =
  | "created"
  | "cod_check_pending"
  | "cod_cleared"
  | "cod_hold"
  | "dispatched"
  | "delivered"
  | "invoiced"
  | "paid"
  | "cancelled";

export interface Order {
  id: string;
  merchant_id: string;
  external_ca_order_number: string | null;
  customer_name: string;
  customer_id: string;
  delivery_address: string;
  material_description: string;
  amount_due_cents: number;
  currency: string;
  order_type: OrderType;
  status: OrderStatus;
  requested_delivery_at: string | null;
  created_at: string;
  updated_at: string;
}
