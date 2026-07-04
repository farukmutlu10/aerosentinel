#!/bin/bash
TOKEN="oxoU_A_PwKrC1XaVvzVgZ7x681MVP_bfmgdun8Nt13X"
API="https://backboard.railway.app/graphql/v2"

# First, commit and push the migration changes
cd "/Users/fm/.gemini/antigravity/scratch/replit-projem/aerosentinel 08jun"
git add artifacts/api-server/src/lib/migrate.ts
git commit -m "feat: add migrations 004-006 (monitor_cache, WX_EXTREME, WIND_EXTREME, LIFR)" 2>/dev/null
git push origin main 2>&1

echo "---"
echo "Git pushed. Railway should auto-deploy if connected to this repo."
echo "---"

# Try to trigger a deployment via the API (deploy to the api-server service)
curl -s "$API" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"mutation { deploymentRedeploy(id: \"accec5e6-3e38-4167-af66-7247c0fc3566\") { id status } }"}'
