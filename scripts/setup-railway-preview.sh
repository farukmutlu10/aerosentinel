#!/bin/bash
set -e

RAILWAY_TOKEN="5nnUaTtJxxf7opzisl_xnmx1y3QaIVX8ZXPNIlBpteS"
PROJECT_ID="ee91a8a4-b9a9-46d3-9e6c-93723ecaab38"
ENVIRONMENT_ID="f815f912-a927-473d-aeb8-cf918b85fe4b"

echo "=== Step 1: Delete manually created postgres service ==="
curl -s -X POST https://backboard.railway.app/graphql/v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RAILWAY_TOKEN" \
  -d "{\"query\":\"mutation serviceDelete(\$id: String!) { serviceDelete(id: \$id) }\",\"variables\":{\"id\":\"e5a25f2d-855f-41d3-bd91-c6dcaa9d6f13\"}}"
echo ""

echo "=== Step 2: List services in preview environment ==="
curl -s -X POST https://backboard.railway.app/graphql/v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RAILWAY_TOKEN" \
  -d "{\"query\":\"query { services(projectId: \\\"$PROJECT_ID\\\") { edges { node { id name } } } }\"}"
echo ""

echo "=== Step 3: Get Postgres service variables ==="
curl -s -X POST https://backboard.railway.app/graphql/v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RAILWAY_TOKEN" \
  -d "{\"query\":\"query { variables(serviceId: \\\"b2e99533-073b-41c9-92f3-2fe8fff79190\\\", environmentId: \\\"$ENVIRONMENT_ID\\\") { name value } }\"}"
echo ""

echo "=== Done ==="
