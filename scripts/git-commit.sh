#!/bin/bash
set -x
cd "/Users/fm/.gemini/antigravity/scratch/replit-projem/aerosentinel 08jun"

# Git commit the migration changes
git add artifacts/api-server/src/lib/migrate.ts
git commit -m "feat: add migrations 004-006 (monitor_cache, WX_EXTREME, WIND_EXTREME, LIFR)" 2>&1 || echo "Nothing to commit"

echo "=== GIT COMMIT DONE ==="
