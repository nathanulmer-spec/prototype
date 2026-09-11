# Fractal Pay Merchant-Layer API Prototype

A prototype merchant-facing API that exists independently of the Command
Alkon-triggered payment-link flow. It's built to show the shape of a platform
merchants could integrate with directly: a versioned REST API, signed
webhooks, and two example tools built on top — automated invoice
reconciliation and a COD (cash/collect-on-delivery) risk check that gates
dispatch on a verified, collectible payment method.

This is a local demo, not a production service: payments and the Command
Alkon order sync are simulated (see `src/mock/`), and data lives in a local
SQLite file at `data/dev.sqlite`.

## Requirements

- Node.js 22+ (uses the built-in `node:sqlite` module — no native build step).

## Setup

```bash
npm install
npm run seed
```

`seed` wipes and recreates `data/dev.sqlite`, then prints a merchant API key
and webhook signing secret you'll need below.

## Running it

Open three terminals:

```bash
# Terminal A — a stand-in for a merchant's own server receiving webhooks
npm run webhook-receiver

# Terminal B — the merchant API
npm run dev

# Terminal C — narrated end-to-end walkthrough
npm run demo
```

`npm run demo` exercises the real HTTP API (not internal function calls) end
to end: a simulated Command Alkon order sync, a COD risk check that clears a
small repeat-customer order, a COD risk check that holds a large first-time
order (and blocks dispatch until it clears), a simulated payment, webhook
delivery to Terminal A (signature-verified there), automatic invoice
reconciliation, and a simulated nightly funding batch.

## Auth

Every route except `/api/v1/health` requires:

```
Authorization: Bearer <merchant api_key>
```

This is a prototype stand-in for a real scheme (OAuth2/JWT) — every request
is scoped to the merchant that owns the key.

## API surface (`/api/v1`)

| Resource | Endpoints |
|---|---|
| Orders | `POST/GET /orders`, `GET /orders/:id`, `PATCH /orders/:id/status` |
| COD risk | `POST/GET /orders/:id/cod-check`, `POST /orders/:id/dispatch` |
| Transactions | `POST /transactions`, `GET /transactions`, `GET /transactions/:id`, `POST /transactions/:id/refund` |
| Invoices | `POST/GET /invoices`, `GET /invoices/:id`, `POST /invoices/:id/reconcile` |
| Funding | `GET /funding/batches`, `GET /funding/batches/:id`, `GET /funding/report` |
| Reconciliation | `GET /reconciliation/report`, `GET /reconciliation/unmatched`, `POST /reconciliation/match` |
| Webhooks | `POST/GET /webhooks/subscriptions`, `GET/PATCH/DELETE /webhooks/subscriptions/:id`, `GET /webhooks/deliveries`, `GET /webhooks/deliveries/:id`, `POST /webhooks/deliveries/:id/retry`, `POST /webhooks/test-ping` |
| Simulation (not part of the real surface) | `POST /_demo/simulate-ca-order-sync`, `POST /_demo/simulate-payment`, `POST /_demo/simulate-funding-batch` |

## Manual curl walkthrough

```bash
API_KEY="<paste from npm run seed>"
BASE="http://localhost:3000/api/v1"

# Register a webhook subscription pointing at the local receiver
curl -s -X POST "$BASE/webhooks/subscriptions" \
  -H "authorization: Bearer $API_KEY" -H "content-type: application/json" \
  -d '{"target_url":"http://localhost:4000/webhook","event_types":["payment.succeeded","invoice.reconciled","cod.risk.updated"]}'

# Create an order
curl -s -X POST "$BASE/orders" \
  -H "authorization: Bearer $API_KEY" -H "content-type: application/json" \
  -d '{"customer_name":"Test Co","customer_id":"cust_test","delivery_address":"1 Main St","material_description":"Concrete","amount_due_cents":50000,"order_type":"cod"}'

# Run a COD risk check, then try to dispatch
curl -s -X POST "$BASE/orders/<order_id>/cod-check" \
  -H "authorization: Bearer $API_KEY" -H "content-type: application/json" \
  -d '{"payment_method":"card"}'
curl -s -X POST "$BASE/orders/<order_id>/dispatch" -H "authorization: Bearer $API_KEY"

# Watch webhook deliveries land
curl -s "$BASE/webhooks/deliveries" -H "authorization: Bearer $API_KEY"
```

Use a customer name prefixed `HOLD-` or `DECLINE-` to force those COD risk
outcomes deterministically (see `src/mock/paymentProcessor.ts` and
`src/tools/codRisk/riskRules.ts`). A transaction `amount_cents` ending in
`13` deterministically fails at the mock processor.

## Webhooks

Events: `order.created`, `order.dispatched`, `payment.succeeded`,
`payment.failed`, `payment.refunded`, `invoice.created`, `invoice.reconciled`,
`cod.risk.updated`, `funding.batch.deposited`.

Deliveries are signed Stripe-style:

```
X-Fractalpay-Signature: t=<unix ts>,v1=hmac_sha256(secret, "<ts>.<raw body>")
```

Verify with `src/webhooks/signer.ts:verifySignature` (see
`scripts/webhook-receiver.ts` for a full example). Failed deliveries retry
with backoff (3s/15s/60s) up to 5 attempts, then move to `exhausted`;
`POST /webhooks/deliveries/:id/retry` re-queues one manually.

## Project layout

- `src/api/v1/` — merchant-facing routes
- `src/webhooks/` — event bus, dispatcher, HMAC signer, delivery worker
- `src/tools/reconciliation/` — auto-matches payments to invoices
- `src/tools/codRisk/` — pre-dispatch payment verification + risk policy
- `src/mock/` — simulated payment processor and Command Alkon order sync
- `src/db/` — SQLite schema and repositories
- `scripts/` — `seed.ts`, `demo.ts`, `webhook-receiver.ts`

## Tests

```bash
npm test
```

Covers the HMAC signer and the reconciliation amount-matching logic.

## Deploying a shareable demo link

The `Dockerfile` + `docker-entrypoint.sh` + `render.yaml` in this repo package
the whole thing (API, dashboard, and the webhook receiver running internally)
into one container, for deploying to [Render](https://render.com)'s free tier.

The container's disk is ephemeral — there's no persistent volume on the free
tier, so demo data reseeds fresh on every start (including whenever the free
instance spins down from inactivity and back up on the next visit, which can
take ~30-60s). Setting a `SEED_API_KEY` environment variable keeps the
merchant's API key stable across those restarts, so a link you share keeps
working with the same key.

Steps:

1. Push this repo to a GitHub repo (create one on github.com, or ask me to
   do it with you).
2. In Render: **New +** → **Blueprint**, connect the repo — it picks up
   `render.yaml` automatically.
3. When prompted for `SEED_API_KEY`, set it to any string you'll remember
   (e.g. `demo_sk_fractalpay_shared`) — that's the key you'll hand to whoever
   you share the link with.
4. Deploy. Once it's live, open the Render-assigned URL — it's the same
   dashboard, connect with the `SEED_API_KEY` you chose.

No payment method or paid plan is required for this setup.
