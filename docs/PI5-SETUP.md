# NanoClaw on Raspberry Pi 5

Run your personal Claude assistant on Pi 5 with Telegram.

## Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Pi Model | Pi 5 4GB | Pi 5 8GB |
| Storage | 32GB SD | 256GB+ NVMe SSD |
| OS | Pi OS 64-bit Bookworm | Pi OS 64-bit Lite |
| Network | WiFi | Ethernet |

## Quick Start

```bash
# On your Pi
curl -fsSL https://raw.githubusercontent.com/anthropics/nanoclaw/main/scripts/setup-pi5.sh | bash
```

Or clone and run manually:

```bash
git clone https://github.com/anthropics/nanoclaw.git
cd nanoclaw
./scripts/setup-pi5.sh
```

## Manual Setup

### 1. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Logout and login again
```

### 2. Install Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 3. Clone and Build

```bash
git clone https://github.com/anthropics/nanoclaw.git
cd nanoclaw
npm install
npm run build
./container/build.sh  # Takes 5-10 min first time
```

### 4. Configure

Create `.env` file:

```bash
ANTHROPIC_API_KEY=sk-ant-...
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
ASSISTANT_NAME=Andy
```

### 5. Create Telegram Bot

1. Open Telegram, find @BotFather
2. Send `/newbot`
3. Pick name and username (must end in `bot`)
4. Copy token to `.env`

### 6. Run

```bash
# Test run
npm run dev

# Or via systemd
systemctl --user start nanoclaw
```

## Register Chat

1. Message your bot: `/chatid`
2. Get ID like `tg:123456789`
3. Register via SQLite:

```bash
sqlite3 data/nanoclaw.db "INSERT INTO groups (jid, name, folder) VALUES ('tg:123456789', 'main', 'main');"
mkdir -p groups/main
```

## Service Management

```bash
# Start/stop
systemctl --user start nanoclaw
systemctl --user stop nanoclaw

# Logs
journalctl --user -u nanoclaw -f

# Restart after code changes
systemctl --user restart nanoclaw
```

## Performance Tips

### Use SSD
SD card I/O bottlenecks SQLite and container operations. NVMe SSD via USB 3 or Pi 5 hat essential for good performance.

### Increase Swap
```bash
sudo sed -i 's/CONF_SWAPSIZE=.*/CONF_SWAPSIZE=2048/' /etc/dphys-swapfile
sudo dphys-swapfile setup
sudo dphys-swapfile swapon
```

### Disable Desktop (if using Lite)
Headless saves ~500MB RAM for agent containers.

### Container Memory Limit
If running multiple agents, limit container memory:

```bash
# In container-runner.ts, add to docker run:
--memory=1g --memory-swap=1g
```

## Troubleshooting

### Container build fails
```bash
# Prune and retry
docker system prune -a
./container/build.sh
```

### Out of memory during agent run
```bash
# Check memory
free -h

# Increase swap or reduce concurrent agents
```

### Telegram not connecting
```bash
# Check token
grep TELEGRAM .env

# Check bot status - message /ping to your bot
```

### Agent timeout
Pi 5 slower than Mac. Increase timeouts in `src/config.ts` if needed.

## Architecture Notes

- Container runs ARM64 Debian with Chromium
- Browser automation works but slower than x86
- SQLite on SSD handles typical personal use
- Single Node.js process, single agent at a time (no concurrency needed for personal use)
