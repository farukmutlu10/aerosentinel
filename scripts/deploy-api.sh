#!/bin/bash
TOKEN="${RAILWAY_API_TOKEN:?RAILWAY_API_TOKEN is not set (export it or source your .env before running this script)}"
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
