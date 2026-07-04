#!/bin/bash
cd "/Users/fm/.gemini/antigravity/scratch/replit-projem/aerosentinel 08jun/artifacts/aero-sentinel"
export PORT=5173
exec node node_modules/vite/bin/vite.js --config vite.config.ts --host 0.0.0.0
