#!/bin/bash
set -e
cd '/Users/fm/.gemini/antigravity/scratch/replit-projem/aerosentinel 08jun/artifacts/aero-sentinel'
git add -A
git commit -m "feat: build-time prerendering for server-side meta tags"
cd ..
bash scripts/push-preview.sh
cd artifacts/aero-sentinel
npx wrangler pages deploy dist/public --project-name=aerosentinel --branch=preview
