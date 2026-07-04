#!/bin/bash
set -e
cd "/Users/fm/.gemini/antigravity/scratch/replit-projem/aerosentinel 08jun"

# First, git add and commit the migration changes
git add artifacts/api-server/src/lib/migrate.ts
git commit -m "feat: add migrations 004-006 (monitor_cache, WX_EXTREME, WIND_EXTREME, LIFR)" 2>/dev/null || true

# Push to trigger Railway auto-deploy (if configured)
git push origin main 2>&1 || git push 2>&1 || echo "Git push failed - may need manual push"
