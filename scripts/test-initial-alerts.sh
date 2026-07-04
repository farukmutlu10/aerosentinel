#!/bin/bash
API="https://workspaceapi-server-production-b312.up.railway.app/api"
DEVICE="test-ia-$(date +%s)"

echo "=== Testing Initial Watchlist Alerts ==="
echo "Device ID: $DEVICE"
echo ""

# 1. Add EDDH to watchlist
echo "1. Adding EDDH to watchlist..."
curl -s -X POST "$API/watchlist" \
  -H "Content-Type: application/json" \
  -d '{"icao":"EDDH"}' \
  -H "X-Device-ID: $DEVICE"
echo ""

# 2. Wait for generateInitialAlerts to complete
echo "2. Waiting 10s for generateInitialAlerts..."
sleep 10

# 3. Check alerts
echo "3. Checking alerts..."
ALERTS=$(curl -s "$API/alerts?limit=20" -H "X-Device-ID: $DEVICE")
echo "Alerts: $ALERTS"
echo ""

# 4. Check summary
echo "4. Checking summary..."
SUMMARY=$(curl -s "$API/alerts/summary" -H "X-Device-ID: $DEVICE")
echo "Summary: $SUMMARY"
echo ""

# 5. Count alerts
ALERT_COUNT=$(echo "$ALERTS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "ERROR")
echo "Alert count: $ALERT_COUNT"

if [ "$ALERT_COUNT" -gt 0 ] 2>/dev/null; then
  echo ""
  echo "✅ SUCCESS: $ALERT_COUNT initial alert(s) generated!"
  echo "$ALERTS" | python3 -c "
import sys, json
for a in json.load(sys.stdin):
  print(f'  - {a[\"type\"]} for {a[\"icao\"]} at {a[\"detectedAt\"]}')
"
else
  echo ""
  echo "❌ FAILURE: No initial alerts generated"
fi

# Cleanup
echo ""
echo "5. Cleaning up..."
curl -s -X DELETE "$API/watchlist/$DEVICE" -H "X-Device-ID: $DEVICE" 2>/dev/null
