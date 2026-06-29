#!/bin/bash
set -e
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BASE="/Users/fm/.gemini/antigravity/scratch/replit-projem/aerosentinel 08jun"
PUB="$BASE/artifacts/aero-sentinel/public"

# Generate 1024x1024 source
"$CHROME" --headless=new --disable-gpu --screenshot="$BASE/artifacts/aero-sentinel/public/apple-touch-icon.png" --window-size=1024,1024 --hide-scrollbars "file://$BASE/attached_assets/icon-gen-dark.html"
echo "Generated 1024x1024 source"

ls -la "$PUB/apple-touch-icon.png"
