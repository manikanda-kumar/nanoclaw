#!/bin/bash
# Camofox startup script
# Installs and starts camofox-browser server for anti-detection browsing

set -e

CAMOFOX_DIR="${HOME}/.camofox/server"
CAMOFOX_PORT="${CAMOFOX_PORT:-9377}"

install_camofox() {
  if [ -d "$CAMOFOX_DIR" ] && [ -f "$CAMOFOX_DIR/package.json" ]; then
    echo "[camofox] Already installed at ${CAMOFOX_DIR}"
    return 0
  fi

  echo "[camofox] Installing camofox-browser into ${CAMOFOX_DIR}..."
  mkdir -p "$CAMOFOX_DIR"
  cd "$CAMOFOX_DIR"
  npm init -y > /dev/null 2>&1
  npm install camofox-browser > /dev/null 2>&1
  echo "[camofox] Installation complete"
}

start_camofox() {
  # Check if already listening
  if lsof -i ":${CAMOFOX_PORT}" -sTCP:LISTEN &>/dev/null; then
    echo "[camofox] Already listening on port ${CAMOFOX_PORT}"
    return 0
  fi

  echo "[camofox] Starting server on port ${CAMOFOX_PORT}..."
  cd "$CAMOFOX_DIR"
  npx camofox-browser --port "${CAMOFOX_PORT}" &>/dev/null &

  # Wait for health check (up to 30s — first launch downloads Firefox)
  for i in $(seq 1 60); do
    if curl -sf "http://localhost:${CAMOFOX_PORT}/health" &>/dev/null; then
      echo "[camofox] Server ready on port ${CAMOFOX_PORT}"
      return 0
    fi
    sleep 0.5
  done

  echo "[camofox] Warning: server did not become healthy within 30s"
  return 1
}

install_camofox
start_camofox

export CAMOFOX_PORT
export CAMOFOX_API_KEY="${CAMOFOX_API_KEY:-}"
