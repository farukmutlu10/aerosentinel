#!/bin/bash
set -e

: "${RAILWAY_TOKEN:?RAILWAY_TOKEN env var is required (e.g. export RAILWAY_TOKEN=... before running this script)}"
POSTGRES_SERVICE_ID="e5a25f2d-855f-41d3-bd91-c6dcaa9d6f13"

echo "=== Deleting manually created postgres service ==="
curl -s -X POST https://backboard.railway.app/graphql/v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RAILWAY_TOKEN" \
  -d "{\"query\":\"mutation serviceDelete(\$id: String!) { serviceDelete(id: \$id) }\",\"variables\":{\"id\":\"$POSTGRES_SERVICE_ID\"}}"

echo ""
echo "=== Done ==="
