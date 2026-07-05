#!/bin/bash
set -e
cd "/Users/fm/.gemini/antigravity/scratch/replit-projem/aerosentinel 08jun"
git add artifacts/api-server/src/lib/monitor.ts
git commit -m "debug(monitor): add diag logs + tafType/metarType support"
git push origin main
echo "=== DONE ==="
