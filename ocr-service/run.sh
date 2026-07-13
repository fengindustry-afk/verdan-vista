#!/usr/bin/env bash
# Start the OCR service, binding to all interfaces so a bridged-network VM is
# reachable from your dev machine / phone on the same LAN.
set -euo pipefail
cd "$(dirname "$0")"

# Load .env if present (KEY=VALUE lines).
if [ -f .env ]; then set -a; . ./.env; set +a; fi

exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
