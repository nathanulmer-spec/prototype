import { getDb } from "../client.js";
import { makeId } from "../../utils/ids.js";
import type { FundingBatch } from "../../domain/fundingBatch.js";

export interface CreateFundingBatchInput {
  merchant_id: string;
  batch_date: string;
  card_total_cents: number;
  ach_total_cents: number;
  fee_total_cents: number;
}

export const fundingBatchesRepo = {
  create(input: CreateFundingBatchInput): FundingBatch {
    const db = getDb();
    const now = new Date().toISOString();
    const netDepositCents =
      input.card_total_cents + input.ach_total_cents - input.fee_total_cents;
    const batch: FundingBatch = {
      id: makeId("fb"),
      merchant_id: input.merchant_id,
      batch_date: input.batch_date,
      card_total_cents: input.card_total_cents,
      ach_total_cents: input.ach_total_cents,
      fee_total_cents: input.fee_total_cents,
      net_deposit_cents: netDepositCents,
      status: "pending",
      deposited_at: null,
      created_at: now,
    };
    db.prepare(
      `INSERT INTO funding_batches (
        id, merchant_id, batch_date, card_total_cents, ach_total_cents,
        fee_total_cents, net_deposit_cents, status, deposited_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      batch.id,
      batch.merchant_id,
      batch.batch_date,
      batch.card_total_cents,
      batch.ach_total_cents,
      batch.fee_total_cents,
      batch.net_deposit_cents,
      batch.status,
      batch.deposited_at,
      batch.created_at,
    );
    return batch;
  },

  findById(merchantId: string, id: string): FundingBatch | undefined {
    const db = getDb();
    return db
      .prepare(`SELECT * FROM funding_batches WHERE id = ? AND merchant_id = ?`)
      .get(id, merchantId) as FundingBatch | undefined;
  },

  list(merchantId: string, limit = 50, offset = 0): FundingBatch[] {
    const db = getDb();
    return db
      .prepare(
        `SELECT * FROM funding_batches WHERE merchant_id = ?
         ORDER BY batch_date DESC LIMIT ? OFFSET ?`,
      )
      .all(merchantId, limit, offset) as unknown as FundingBatch[];
  },

  markDeposited(merchantId: string, id: string): FundingBatch | undefined {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE funding_batches SET status = 'deposited', deposited_at = ? WHERE id = ? AND merchant_id = ?`,
    ).run(now, id, merchantId);
    return this.findById(merchantId, id);
  },

  report(merchantId: string, from?: string, to?: string) {
    const db = getDb();
    const clauses = ["merchant_id = ?"];
    const params: (string | number)[] = [merchantId];
    if (from) {
      clauses.push("batch_date >= ?");
      params.push(from);
    }
    if (to) {
      clauses.push("batch_date <= ?");
      params.push(to);
    }
    const row = db
      .prepare(
        `SELECT
           COALESCE(SUM(card_total_cents), 0) as total_card_cents,
           COALESCE(SUM(ach_total_cents), 0) as total_ach_cents,
           COALESCE(SUM(fee_total_cents), 0) as total_fee_cents,
           COALESCE(SUM(net_deposit_cents), 0) as total_net_deposit_cents,
           COUNT(*) as batch_count
         FROM funding_batches WHERE ${clauses.join(" AND ")}`,
      )
      .get(...params) as {
      total_card_cents: number;
      total_ach_cents: number;
      total_fee_cents: number;
      total_net_deposit_cents: number;
      batch_count: number;
    };
    return row;
  },
};
