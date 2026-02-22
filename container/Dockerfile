# NanoClaw Agent Container
# Runs Claude Agent SDK in isolated Linux VM with browser automation

FROM node:22-slim

# Install system dependencies for Chromium
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    libgbm1 \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libasound2 \
    libpangocairo-1.0-0 \
    libcups2 \
    libdrm2 \
    libxshmfence1 \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set Chromium path for agent-browser
ENV AGENT_BROWSER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

# Install agent-browser and claude-code globally
RUN npm install -g agent-browser @anthropic-ai/claude-code

# Create app directory
WORKDIR /app

# Copy package files first for better caching
COPY agent-runner/package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY agent-runner/ ./

# Build TypeScript
RUN npm run build

# Create workspace directories
RUN mkdir -p /workspace/group /workspace/global /workspace/extra /workspace/ipc/messages /workspace/ipc/tasks /workspace/ipc/input

# Create entrypoint script
# Sources env from mounted /workspace/env-dir/env if it exists (workaround for Apple Container -i bug)
# Probes likely host CDP endpoints and connects agent-browser for host session reuse
# Stdin is buffered to /tmp then piped (Apple Container requires EOF to flush stdin pipe)
# Follow-up messages arrive via IPC files in /workspace/ipc/input/
RUN cat > /app/entrypoint.sh <<'EOF'
#!/bin/bash
set -e
[ -f /workspace/env-dir/env ] && export $(cat /workspace/env-dir/env | xargs)

# Configure agent-browser to connect to host Chrome via CDP.
# Supports explicit CHROME_CDP_URL and robust fallback probing by host/port.
if [ -n "$CHROME_CDP_URL" ] || [ -n "$CHROME_CDP_PORT" ]; then
  connected=0
  cdp_candidates=()

  if [ -n "$CHROME_CDP_URL" ]; then
    cdp_candidates+=("$CHROME_CDP_URL")
  fi

  if [ -n "$CHROME_CDP_PORT" ]; then
    if [ -n "$CHROME_CDP_HOST" ]; then
      cdp_candidates+=("http://${CHROME_CDP_HOST}:${CHROME_CDP_PORT}")
    fi

    if command -v ip >/dev/null 2>&1; then
      HOST_GW=$(ip route | awk '/default/{print $3; exit}')
      if [ -n "$HOST_GW" ]; then
        cdp_candidates+=("http://${HOST_GW}:${CHROME_CDP_PORT}")
      fi
    elif [ -r /proc/net/route ]; then
      GW_HEX=$(awk '$2=="00000000" {print $3; exit}' /proc/net/route)
      if [ -n "$GW_HEX" ]; then
        HOST_GW=$(printf '%d.%d.%d.%d' \
          $((16#${GW_HEX:6:2})) $((16#${GW_HEX:4:2})) \
          $((16#${GW_HEX:2:2})) $((16#${GW_HEX:0:2})))
        cdp_candidates+=("http://${HOST_GW}:${CHROME_CDP_PORT}")
      fi
    fi

    cdp_candidates+=(
      "http://host.containers.internal:${CHROME_CDP_PORT}"
      "http://host.docker.internal:${CHROME_CDP_PORT}"
      "http://gateway.docker.internal:${CHROME_CDP_PORT}"
      "http://192.168.64.1:${CHROME_CDP_PORT}"
      "http://172.17.0.1:${CHROME_CDP_PORT}"
      "http://127.0.0.1:${CHROME_CDP_PORT}"
    )
  fi

  tried=()
  for cdp_url in "${cdp_candidates[@]}"; do
    if [ -z "$cdp_url" ]; then
      continue
    fi

    # Deduplicate candidates in-order.
    skip=0
    for prev in "${tried[@]}"; do
      if [ "$prev" = "$cdp_url" ]; then
        skip=1
        break
      fi
    done
    if [ "$skip" -eq 1 ]; then
      continue
    fi
    tried+=("$cdp_url")

    if agent-browser connect "$cdp_url" >/dev/null 2>&1; then
      echo "[entrypoint] agent-browser connected to host Chrome via CDP at ${cdp_url}" >&2
      connected=1
      break
    fi
  done

  if [ "$connected" -ne 1 ]; then
    echo "[entrypoint] agent-browser CDP connect failed for all candidates, using built-in Chromium" >&2
  fi
fi

cd /app && npx tsc --outDir /tmp/dist 2>&1 >&2
ln -s /app/node_modules /tmp/dist/node_modules
chmod -R a-w /tmp/dist
cat > /tmp/input.json
node /tmp/dist/index.js < /tmp/input.json
EOF
RUN chmod +x /app/entrypoint.sh

# Set ownership to node user (non-root) for writable directories
RUN chown -R node:node /workspace

# Switch to non-root user (required for --dangerously-skip-permissions)
USER node

# Set working directory to group workspace
WORKDIR /workspace/group

# Entry point reads JSON from stdin, outputs JSON to stdout
ENTRYPOINT ["/app/entrypoint.sh"]
