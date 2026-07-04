#!/bin/bash
set -e

PROJECT_ID="ee91a8a4-b9a9-46d3-9e6c-93723ecaab38"
PREVIEW_ENV_ID="f815f912-a927-473d-aeb8-cf918b85fe4b"
PROD_ENV_ID="6359edf1-820c-41c7-8a50-9e8ed3acf083"

echo "=== Setting up Railway Preview Environment ==="
echo ""

# Check current status
echo "1. Current Railway status:"
npx @railway/cli status
echo ""

# Add api-server service to preview environment  
echo "2. Adding api-server service to preview environment..."
npx @railway/cli add --service api-server --json
echo ""

# List services
echo "3. Services in preview environment:"
npx @railway/cli service list --json
echo ""

echo "=== Setup complete ==="
