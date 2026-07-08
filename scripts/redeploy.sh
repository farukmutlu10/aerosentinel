#!/bin/bash
TOKEN="${RAILWAY_API_TOKEN:?RAILWAY_API_TOKEN is not set (export it or source your .env before running this script)}"
API="https://backboard.railway.app/graphql/v2"

# Trigger a redeploy of the api-server's current deployment
curl -s "$API" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"mutation { deploymentRedeploy(id: \"accec5e6-3e38-4167-af66-7247c0fc3566\") { id status } }"}'
