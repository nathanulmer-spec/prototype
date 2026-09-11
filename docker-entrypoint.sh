#!/bin/sh
set -e

# The container's disk is ephemeral (Render's free tier has no persistent
# volume, and even a paid one would reset on redeploy), so we reseed fresh
# demo data on every start. SEED_API_KEY (set as a platform env var) keeps
# the merchant api_key stable across restarts so a shared link keeps working.
node dist/scripts/seed.js

# The webhook receiver stands in for a merchant's own server; it only needs
# to be reachable from inside this container, not from the internet.
node dist/scripts/webhook-receiver.js &

exec node dist/src/index.js
