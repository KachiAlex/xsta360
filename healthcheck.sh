#!/bin/bash
set -e

URL="https://xsta360.67-211-210-8.sslip.io/api/health"
WEBHOOK="${ALERT_WEBHOOK:-}"

status=$(curl -s -o /tmp/health.json -w "%{http_code}" "$URL" 2>/dev/null)

if [ "$status" != "200" ]; then
  body=$(cat /tmp/health.json 2>/dev/null || echo "no response")
  echo "[healthcheck] CRITICAL - $URL returned $status: $body" | logger -t xsta360-healthcheck
  if [ -n "$WEBHOOK" ]; then
    curl -s -X POST -H "Content-Type: application/json" \
      -d "{\"text\":\"Xsta360 healthcheck failed: $URL returned $status\"}" \
      "$WEBHOOK" >/dev/null 2>&1 || true
  fi
  exit 1
fi

echo "[healthcheck] OK - $URL returned $status" | logger -t xsta360-healthcheck
