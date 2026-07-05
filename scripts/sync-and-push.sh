#!/bin/bash
set -x
cd "/Users/fm/.gemini/antigravity/scratch/replit-projem/aerosentinel 08jun"
echo "=== Current branch ==="
git branch --show-current
echo "=== Latest main commit ==="
git log --oneline -1 main
echo "=== Pushing main to origin ==="
git push origin main 2>&1
PUSH_EXIT=$?
echo "=== Push exit code: $PUSH_EXIT ==="
echo "=== Syncing preview with main ==="
git checkout preview
git merge main --no-edit
git checkout main
echo "=== ALL DONE ==="
