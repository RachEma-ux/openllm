#!/data/data/com.termux/files/usr/bin/bash
# OpenLLM Termux Launcher — start Ollama + web UI in one command

set -e

TMPDIR="${TMPDIR:-/data/data/com.termux/files/usr/tmp}"
PORT="${OPENLLM_WEB_PORT:-5000}"
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "╔══════════════════════════════╗"
echo "║        OpenLLM Termux        ║"
echo "╚══════════════════════════════╝"

# Start Ollama if not running
if ! pgrep -x ollama > /dev/null 2>&1; then
  echo "[1/3] Starting Ollama..."
  nohup ollama serve > "$TMPDIR/ollama.log" 2>&1 &
  sleep 3
  if pgrep -x ollama > /dev/null 2>&1; then
    echo "  ✓ Ollama running"
  else
    echo "  ✗ Ollama failed to start (continuing without it)"
  fi
else
  echo "[1/3] Ollama already running ✓"
fi

# Check available models
echo "[2/3] Checking models..."
MODELS=$(curl -s http://localhost:11434/api/tags 2>/dev/null | python3 -c "import sys,json; [print('  •',m['name']) for m in json.load(sys.stdin).get('models',[])]" 2>/dev/null || echo "  (none found)")
echo "$MODELS"

# Start web UI
echo "[3/3] Starting OpenLLM on port $PORT..."
kill $(lsof -ti :"$PORT") 2>/dev/null || true

cd "$SCRIPT_DIR"
TMPDIR="$TMPDIR" \
OPENAI_BASE_URL="${OPENAI_BASE_URL:-http://localhost:11434/v1}" \
OPENAI_MODEL="${OPENAI_MODEL:-tinyllama}" \
  npx tsx src/web/node-server.ts &
SERVER_PID=$!

sleep 5

if curl -s "http://127.0.0.1:$PORT/api/health" > /dev/null 2>&1; then
  echo ""
  echo "═══════════════════════════════"
  echo "  OpenLLM running!"
  echo "  http://127.0.0.1:$PORT"
  echo "  Install as app: open in Chrome → ⋮ → Add to Home Screen"
  echo "═══════════════════════════════"
  xdg-open "http://127.0.0.1:$PORT/" 2>/dev/null || true
else
  echo "  ✗ Server failed to start"
  cat "$TMPDIR/openllm-node.log" 2>/dev/null
  exit 1
fi

# Keep running
wait $SERVER_PID
