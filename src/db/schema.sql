CREATE TABLE IF NOT EXISTS merchants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  legal_name TEXT NOT NULL,
  industry TEXT NOT NULL DEFAULT 'ready_mix_concrete',
  api_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  external_ca_order_number TEXT,
  customer_name TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  delivery_address TEXT NOT NULL,
  material_description TEXT NOT NULL,
  amount_due_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  order_type TEXT NOT NULL CHECK (order_type IN ('cod', 'invoice_terms', 'prepaid')),
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN (
    'created', 'cod_check_pending', 'cod_cleared', 'cod_hold',
    'dispatched', 'delivered', 'invoiced', 'paid', 'cancelled'
  )),
  requested_delivery_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_merchant ON orders(merchant_id);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  order_id TEXT REFERENCES orders(id),
  invoice_number TEXT NOT NULL,
  amount_due_cents INTEGER NOT NULL,
  amount_paid_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'partially_paid', 'paid', 'reconciled', 'void', 'overdue'
  )),
  due_date TEXT,
  reconciled_at TEXT,
  reconciled_transaction_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invoices_merchant ON invoices(merchant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_order ON invoices(order_id);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  invoice_id TEXT REFERENCES invoices(id),
  order_id TEXT REFERENCES orders(id),
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  payment_method TEXT NOT NULL CHECK (payment_method IN ('card', 'ach')),
  payment_method_last4 TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'succeeded', 'failed', 'refunded', 'partially_refunded'
  )),
  failure_reason TEXT,
  processor_reference TEXT,
  funding_batch_id TEXT REFERENCES funding_batches(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transactions_merchant ON transactions(merchant_id);
CREATE INDEX IF NOT EXISTS idx_transactions_invoice ON transactions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_transactions_order ON transactions(order_id);

CREATE TABLE IF NOT EXISTS funding_batches (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  batch_date TEXT NOT NULL,
  card_total_cents INTEGER NOT NULL DEFAULT 0,
  ach_total_cents INTEGER NOT NULL DEFAULT 0,
  fee_total_cents INTEGER NOT NULL DEFAULT 0,
  net_deposit_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'deposited')),
  deposited_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_funding_batches_merchant ON funding_batches(merchant_id);

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  target_url TEXT NOT NULL,
  event_types TEXT NOT NULL,
  signing_secret TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_merchant ON webhook_subscriptions(merchant_id);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES webhook_subscriptions(id),
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  event_type TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed', 'exhausted')),
  last_attempt_at TEXT,
  next_attempt_at TEXT NOT NULL,
  response_status_code INTEGER,
  response_body_snippet TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_merchant ON webhook_deliveries(merchant_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status_next ON webhook_deliveries(status, next_attempt_at);

CREATE TABLE IF NOT EXISTS cod_checks (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  order_id TEXT NOT NULL REFERENCES orders(id),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('card', 'ach')),
  risk_status TEXT NOT NULL CHECK (risk_status IN ('pending', 'cleared', 'hold', 'declined')),
  reason TEXT,
  checked_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cod_checks_order ON cod_checks(order_id);
