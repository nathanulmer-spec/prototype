import { getDb } from "../client.js";
import { makeId } from "../../utils/ids.js";
import type { Merchant } from "../../domain/merchant.js";

export interface CreateMerchantInput {
  name: string;
  legal_name: string;
  industry?: string;
  api_key: string;
}

export const merchantsRepo = {
  create(input: CreateMerchantInput): Merchant {
    const db = getDb();
    const merchant: Merchant = {
      id: makeId("mer"),
      name: input.name,
      legal_name: input.legal_name,
      industry: input.industry ?? "ready_mix_concrete",
      api_key: input.api_key,
      status: "active",
      created_at: new Date().toISOString(),
    };
    db.prepare(
      `INSERT INTO merchants (id, name, legal_name, industry, api_key, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      merchant.id,
      merchant.name,
      merchant.legal_name,
      merchant.industry,
      merchant.api_key,
      merchant.status,
      merchant.created_at,
    );
    return merchant;
  },

  findById(id: string): Merchant | undefined {
    const db = getDb();
    return db.prepare(`SELECT * FROM merchants WHERE id = ?`).get(id) as Merchant | undefined;
  },

  findByApiKey(apiKey: string): Merchant | undefined {
    const db = getDb();
    return db.prepare(`SELECT * FROM merchants WHERE api_key = ?`).get(apiKey) as
      | Merchant
      | undefined;
  },

  list(): Merchant[] {
    const db = getDb();
    return db.prepare(`SELECT * FROM merchants ORDER BY created_at`).all() as unknown as Merchant[];
  },
};
