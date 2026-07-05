#!/bin/bash
set -x
cd "/Users/fm/.gemini/antigravity/scratch/replit-projem/aerosentinel 08jun"

echo "=== Checking current branch ==="
git branch --show-current

echo "=== Merging preview into main ==="
git checkout main
git merge preview --no-edit

echo "=== Pushing main to origin ==="
git push origin main

echo "=== Triggering Railway backend redeploy ==="
TOKEN="a5fd363a-cd15-4a9d-8ec3-c3085c63a85a"
API="https://backboard.railway.app/graphql/v2"
curl -s "$API" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"mutation { deploymentRedeploy(id: \"accec5e6-3e38-4167-af66-7247c0fc3566\") { id status } }"}'

echo "=== Switching back to preview ==="
git checkout preview

echo "=== ALL DONE ==="
