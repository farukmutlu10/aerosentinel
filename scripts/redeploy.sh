#!/bin/bash
TOKEN="oxoU_A_PwKrC1XaVvzVgZ7x681MVP_bfmgdun8Nt13X"
API="https://backboard.railway.app/graphql/v2"

# Trigger a redeploy of the api-server's current deployment
curl -s "$API" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"mutation { deploymentRedeploy(id: \"accec5e6-3e38-4167-af66-7247c0fc3566\") { id status } }"}'
