#!/bin/bash
set -e

PROJROOT="/Users/fm/.gemini/antigravity/scratch/replit-projem/aerosentinel 08jun"

echo "=== Starting AeroSentinel local dev servers ==="

# Build backend
echo "[1/3] Building API server..."
cd "$PROJROOT/artifacts/api-server"
node ./build.mjs
echo "[1/3] ✅ API server built."

# Start backend
echo "[2/3] Starting API server on port 5001..."
cd "$PROJROOT/artifacts/api-server"
PORT=5001 NODE_ENV=development nohup node dist/index.mjs > /tmp/api-server.log 2>&1 &
API_PID=$!
echo "[2/3] API server started (PID=$API_PID). Log: /tmp/api-server.log"

# Wait for backend to be ready
sleep 3
if lsof -ti:5001 > /dev/null 2>&1; then
  echo "[2/3] ✅ API server listening on port 5001"
else
  echo "[2/3] ❌ API server failed to start. Check /tmp/api-server.log"
  cat /tmp/api-server.log
  exit 1
fi

# Start frontend
echo "[3/3] Starting Vite dev server on port 5173..."
cd "$PROJROOT/artifacts/aero-sentinel"
PORT=5173 nohup node node_modules/vite/bin/vite.js --config vite.config.ts --host 0.0.0.0 > /tmp/vite-dev.log 2>&1 &
VITE_PID=$!
echo "[3/3] Vite dev server started (PID=$VITE_PID). Log: /tmp/vite-dev.log"

# Wait for vite to be ready
sleep 5
if lsof -ti:5173 > /dev/null 2>&1; then
  echo "[3/3] ✅ Vite dev server listening on port 5173"
else
  echo "[3/3] ❌ Vite dev server failed to start. Check /tmp/vite-dev.log"
  cat /tmp/vite-dev.log
  exit 1
fi

echo ""
echo "=== All servers running ==="
echo "  Backend API: http://localhost:5001"
echo "  Frontend:    http://localhost:5173"
echo ""
echo "Open http://localhost:5173 in your browser"
echo ""
echo "Logs:"
echo "  Backend:  /tmp/api-server.log"
echo "  Frontend: /tmp/vite-dev.log"
