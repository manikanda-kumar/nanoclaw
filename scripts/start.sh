#!/bin/bash
# NanoClaw startup script
# Ensures Chrome remote debugging is available before starting the main process

set -e

CHROME_APP="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
CDP_PORT="${CHROME_CDP_PORT:-9222}"
CDP_BIND_ADDRESS="${CHROME_CDP_BIND_ADDRESS:-0.0.0.0}"

# --- Chrome Remote Debugging ---
# Launches Chrome with remote debugging so container agents can reuse host browser sessions.
# If Chrome is already running with debugging, this is a no-op.

start_chrome_cdp() {
  # Check if something is already listening on the CDP port
  if lsof -i ":${CDP_PORT}" -sTCP:LISTEN &>/dev/null; then
    echo "[nanoclaw] Chrome CDP already listening on port ${CDP_PORT}"
    return 0
  fi

  if [ ! -f "$CHROME_APP" ]; then
    echo "[nanoclaw] Chrome not found at ${CHROME_APP}, skipping CDP setup"
    echo "[nanoclaw] Container agents will use their built-in Chromium (no session reuse)"
    return 0
  fi

  echo "[nanoclaw] Starting Chrome with remote debugging on port ${CDP_PORT}..."
  "$CHROME_APP" \
    --remote-debugging-address="${CDP_BIND_ADDRESS}" \
    --remote-debugging-port="${CDP_PORT}" \
    --no-first-run \
    --no-default-browser-check \
    &>/dev/null &

  # Wait for CDP to become available (up to 10s)
  for i in $(seq 1 20); do
    if lsof -i ":${CDP_PORT}" -sTCP:LISTEN &>/dev/null; then
      echo "[nanoclaw] Chrome CDP ready on port ${CDP_PORT}"
      return 0
    fi
    sleep 0.5
  done

  echo "[nanoclaw] Warning: Chrome CDP did not start within 10s, continuing anyway"
}

start_chrome_cdp

# Export CDP port so container-runner can pass it to containers
export CHROME_CDP_PORT="${CDP_PORT}"

# --- Start NanoClaw ---
exec node "$(dirname "$0")/../dist/index.js"
