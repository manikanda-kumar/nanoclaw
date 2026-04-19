#!/bin/bash
# NanoClaw Pi 5 Setup Script
# Requires: Raspberry Pi 5 (8GB), SSD, Pi OS 64-bit (Bookworm)

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Check if running on Pi
check_pi() {
    if ! grep -q "Raspberry Pi" /proc/cpuinfo 2>/dev/null; then
        warn "Not running on Raspberry Pi - some checks skipped"
        return
    fi

    # Check Pi model
    model=$(cat /proc/cpuinfo | grep "Model" | cut -d: -f2 | xargs)
    info "Detected: $model"

    # Check memory (need at least 4GB)
    mem_kb=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    mem_gb=$((mem_kb / 1024 / 1024))
    if [ "$mem_gb" -lt 4 ]; then
        error "Need at least 4GB RAM. Found: ${mem_gb}GB"
    fi
    info "Memory: ${mem_gb}GB ✓"

    # Check if booting from SSD (not SD card)
    root_device=$(findmnt -n -o SOURCE /)
    if echo "$root_device" | grep -q "mmcblk"; then
        warn "Booting from SD card. SSD recommended for performance."
    else
        info "SSD boot detected ✓"
    fi
}

# Install Docker
install_docker() {
    if command -v docker &>/dev/null; then
        info "Docker already installed: $(docker --version)"
        return
    fi

    info "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER

    # Enable Docker service
    sudo systemctl enable docker
    sudo systemctl start docker

    info "Docker installed. You may need to logout/login for group changes."
}

# Install Node.js 22
install_node() {
    if command -v node &>/dev/null; then
        node_ver=$(node --version)
        if [[ "$node_ver" == v22* ]] || [[ "$node_ver" == v23* ]] || [[ "$node_ver" == v24* ]]; then
            info "Node.js already installed: $node_ver"
            return
        fi
        warn "Node.js $node_ver found, but v22+ recommended"
    fi

    info "Installing Node.js 22..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
    info "Node.js installed: $(node --version)"
}

# Configure swap (helpful for builds)
configure_swap() {
    current_swap=$(free -m | awk '/Swap/{print $2}')
    if [ "$current_swap" -lt 2000 ]; then
        info "Increasing swap to 2GB for builds..."
        sudo dphys-swapfile swapoff || true
        sudo sed -i 's/CONF_SWAPSIZE=.*/CONF_SWAPSIZE=2048/' /etc/dphys-swapfile
        sudo dphys-swapfile setup
        sudo dphys-swapfile swapon
        info "Swap configured: 2GB"
    else
        info "Swap adequate: ${current_swap}MB"
    fi
}

# Setup NanoClaw
setup_nanoclaw() {
    INSTALL_DIR="${NANOCLAW_DIR:-$HOME/nanoclaw}"

    if [ -d "$INSTALL_DIR" ]; then
        info "NanoClaw directory exists at $INSTALL_DIR"
        cd "$INSTALL_DIR"
        git pull origin main || true
    else
        info "Cloning NanoClaw..."
        git clone https://github.com/anthropics/nanoclaw.git "$INSTALL_DIR"
        cd "$INSTALL_DIR"
    fi

    info "Installing dependencies..."
    npm install

    info "Building TypeScript..."
    npm run build
}

# Build container (ARM64)
build_container() {
    cd "${NANOCLAW_DIR:-$HOME/nanoclaw}"

    info "Building agent container (ARM64)..."
    info "This may take 5-10 minutes on first build..."

    # Ensure buildx is available
    docker buildx create --use --name nanoclaw-builder 2>/dev/null || true

    ./container/build.sh

    info "Container built ✓"
}

# Setup Telegram bot
setup_telegram() {
    ENV_FILE="${NANOCLAW_DIR:-$HOME/nanoclaw}/.env"

    if [ -f "$ENV_FILE" ] && grep -q "TELEGRAM_BOT_TOKEN" "$ENV_FILE"; then
        info "Telegram token already configured"
        return
    fi

    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "  TELEGRAM BOT SETUP"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "  1. Open Telegram, search for @BotFather"
    echo "  2. Send: /newbot"
    echo "  3. Choose a name (e.g., 'My NanoClaw')"
    echo "  4. Choose a username (must end in 'bot', e.g., 'my_nanoclaw_bot')"
    echo "  5. Copy the token BotFather gives you"
    echo ""
    read -p "Enter your Telegram bot token (or press Enter to skip): " token

    if [ -n "$token" ]; then
        echo "TELEGRAM_BOT_TOKEN=$token" >> "$ENV_FILE"
        info "Telegram token saved to .env"
    else
        warn "Skipped Telegram setup. Add TELEGRAM_BOT_TOKEN to .env later."
    fi
}

# Setup Anthropic API key
setup_anthropic() {
    ENV_FILE="${NANOCLAW_DIR:-$HOME/nanoclaw}/.env"

    if [ -f "$ENV_FILE" ] && grep -q "ANTHROPIC_API_KEY" "$ENV_FILE"; then
        info "Anthropic API key already configured"
        return
    fi

    echo ""
    read -p "Enter your Anthropic API key (or press Enter to skip): " api_key

    if [ -n "$api_key" ]; then
        echo "ANTHROPIC_API_KEY=$api_key" >> "$ENV_FILE"
        info "API key saved to .env"
    else
        warn "Skipped API key setup. Add ANTHROPIC_API_KEY to .env later."
    fi
}

# Create systemd service
create_service() {
    INSTALL_DIR="${NANOCLAW_DIR:-$HOME/nanoclaw}"
    SERVICE_FILE="$HOME/.config/systemd/user/nanoclaw.service"

    mkdir -p "$HOME/.config/systemd/user"

    cat > "$SERVICE_FILE" << EOF
[Unit]
Description=NanoClaw Personal Assistant
After=network.target docker.service

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/node $INSTALL_DIR/dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
EOF

    systemctl --user daemon-reload
    systemctl --user enable nanoclaw

    info "Systemd service created"
    echo ""
    echo "  Start:   systemctl --user start nanoclaw"
    echo "  Stop:    systemctl --user stop nanoclaw"
    echo "  Logs:    journalctl --user -u nanoclaw -f"
    echo "  Status:  systemctl --user status nanoclaw"
}

# Enable lingering (keeps services running after logout)
enable_lingering() {
    if ! loginctl show-user $USER | grep -q "Linger=yes"; then
        info "Enabling lingering for user services..."
        sudo loginctl enable-linger $USER
    fi
}

# Main
main() {
    echo ""
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║           NanoClaw Pi 5 Setup                                 ║"
    echo "║           Personal Claude Assistant                           ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo ""

    check_pi
    configure_swap
    install_docker
    install_node
    setup_nanoclaw
    build_container
    setup_telegram
    setup_anthropic
    create_service
    enable_lingering

    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "  SETUP COMPLETE"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "  Next steps:"
    echo ""
    echo "  1. If Docker was just installed, logout and login again"
    echo ""
    echo "  2. Start NanoClaw:"
    echo "     systemctl --user start nanoclaw"
    echo ""
    echo "  3. Register your Telegram chat:"
    echo "     - Message your bot: /chatid"
    echo "     - Note the chat ID (e.g., tg:123456789)"
    echo "     - Add to groups table in SQLite or via main channel"
    echo ""
    echo "  4. View logs:"
    echo "     journalctl --user -u nanoclaw -f"
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
}

main "$@"
