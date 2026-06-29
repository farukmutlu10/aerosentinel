#!/bin/bash
# Resize the 1024x1024 icon to 180x180 for apple-touch-icon
sips -z 180 180 artifacts/aero-sentinel/public/apple-touch-icon-1024.png --out artifacts/aero-sentinel/public/apple-touch-icon.png
echo "Done: apple-touch-icon.png"
ls -la artifacts/aero-sentinel/public/apple-touch-icon.png
