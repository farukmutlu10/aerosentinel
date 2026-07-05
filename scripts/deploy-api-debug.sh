#!/bin/bash
set -x
cd "/Users/fm/.gemini/antigravity/scratch/replit-projem/aerosentinel 08jun"
git add artifacts/api-server/src/routes/health.ts artifacts/api-server/src/routes/watchlist.ts artifacts/api-server/src/lib/monitor.ts
git commit -m "feat(api): add monitor debug endpoint and force-check for alerts"
git push origin main
echo "=== DONE ==="
