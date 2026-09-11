import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { config } from "../config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let instance: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (instance) return instance;

  mkdirSync(dirname(config.dbPath), { recursive: true });
  instance = new DatabaseSync(config.dbPath);
  instance.exec("PRAGMA journal_mode = WAL;");
  instance.exec("PRAGMA foreign_keys = ON;");

  const schema = readFileSync(join(__dirname, "schema.sql"), "utf-8");
  instance.exec(schema);

  return instance;
}
