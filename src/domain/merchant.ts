export type MerchantStatus = "active" | "suspended";

export interface Merchant {
  id: string;
  name: string;
  legal_name: string;
  industry: string;
  api_key: string;
  status: MerchantStatus;
  created_at: string;
}
