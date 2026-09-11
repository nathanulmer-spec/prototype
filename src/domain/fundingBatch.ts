export type FundingBatchStatus = "pending" | "deposited";

export interface FundingBatch {
  id: string;
  merchant_id: string;
  batch_date: string;
  card_total_cents: number;
  ach_total_cents: number;
  fee_total_cents: number;
  net_deposit_cents: number;
  status: FundingBatchStatus;
  deposited_at: string | null;
  created_at: string;
}
