#!/bin/bash
set -x
cd "/Users/fm/.gemini/antigravity/scratch/replit-projem/aerosentinel 08jun"

# Check git remotes
echo "=== Git Remotes ==="
git remote -v

# Push to trigger Railway auto-deploy
echo "=== Pushing ==="
git push origin main 2>&1 || git push 2>&1

echo "=== PUSH DONE ==="
