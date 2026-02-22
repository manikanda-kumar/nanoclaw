# NanoClaw Setup Guide (Telegram)

This guide covers setting up NanoClaw with Telegram as the messaging channel.

## Prerequisites

- macOS with Apple Silicon
- Node.js 22+
- Homebrew

## 1. Install Dependencies

```bash
cd nanoclaw
npm install
```

## 2. Install Apple Container

```bash
brew install container
container system kernel set --recommended
container system start
```

Verify installation:
```bash
container --version
container system status
```

## 3. Configure Claude Authentication

You need either a Claude subscription (Pro/Max) or an Anthropic API key.

### Option A: Claude Subscription (Recommended)

1. In a separate terminal, run:
   ```bash
   claude setup-token
   ```
2. Complete browser authentication
3. Copy the token and add to `.env`:
   ```bash
   echo "CLAUDE_CODE_OAUTH_TOKEN=<your-token>" > .env
   ```

### Option B: API Key

```bash
echo "ANTHROPIC_API_KEY=<your-key>" > .env
```

Get your key from https://console.anthropic.com/

## 4. Build Container Image

```bash
./container/build.sh
```

Verify:
```bash
echo '{}' | container run -i --entrypoint /bin/echo nanoclaw-agent:latest "Container OK"
```

## 5. Create Telegram Bot

1. Open Telegram and search for `@BotFather`
2. Send `/newbot` and follow prompts:
   - Bot name: Something friendly (e.g., "My Assistant")
   - Bot username: Must end with "bot" (e.g., "my_assistant_bot")
3. Copy the bot token

Add to `.env`:
```bash
echo "TELEGRAM_BOT_TOKEN=<your-bot-token>" >> .env
echo "TELEGRAM_ONLY=true" >> .env
```

## 6. Configure Assistant Name

Set your preferred trigger word:
```bash
echo "ASSISTANT_NAME=Claude" >> .env
```

In group chats, messages starting with `@Claude` will trigger the agent. In your main channel, no prefix is needed.

Update the agent's identity in `groups/global/CLAUDE.md` and `groups/main/CLAUDE.md`:
- Change `# Andy` to `# Claude`
- Change `You are Andy` to `You are Claude`

## 7. Sync Environment to Container

```bash
mkdir -p data/env
cp .env data/env/env
```

The container reads from `data/env/env`, not `.env` directly.

## 8. Register Main Channel

### Start the bot temporarily

```bash
npm run build
npm run dev
```

### Get your chat ID

1. Open Telegram and search for your bot
2. Start the chat and send `/chatid`
3. Copy the chat ID (e.g., `tg:123456789`)

### Register the channel

Create `data/registered_groups.json`:
```json
{
  "tg:YOUR_CHAT_ID": {
    "name": "main",
    "folder": "main",
    "trigger": "@Claude",
    "added_at": "2025-02-09T00:00:00.000Z",
    "requiresTrigger": false
  }
}
```

Create the group folder:
```bash
mkdir -p groups/main/logs
```

Stop the dev server (Ctrl+C).

## 9. Configure External Directory Access (Optional)

To allow the agent to access directories outside NanoClaw:

```bash
mkdir -p ~/.config/nanoclaw
cat > ~/.config/nanoclaw/mount-allowlist.json << 'EOF'
{
  "allowedRoots": [
    {
      "path": "~/Github",
      "allowReadWrite": true,
      "description": "Github repositories"
    }
  ],
  "blockedPatterns": [],
  "nonMainReadOnly": true
}
EOF
```

Fields:
- `path`: Directory to allow access to
- `allowReadWrite`: `true` for read-write, `false` for read-only
- `nonMainReadOnly`: If `true`, non-main groups get read-only access even if `allowReadWrite` is `true`

## 10. Setup launchd Service

Create the NanoClaw plist file:

```bash
NODE_PATH=$(which node)
PROJECT_PATH=$(pwd)
HOME_PATH=$HOME
CONTAINER_PATH=$(dirname $(which container))

cat > ~/Library/LaunchAgents/com.nanoclaw.plist << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.nanoclaw</string>
    <key>ProgramArguments</key>
    <array>
        <string>${NODE_PATH}</string>
        <string>${PROJECT_PATH}/dist/index.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${PROJECT_PATH}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>${CONTAINER_PATH}:/usr/local/bin:/usr/bin:/bin:${HOME_PATH}/.local/bin</string>
        <key>HOME</key>
        <string>${HOME_PATH}</string>
        <key>CHROME_CDP_PORT</key>
        <string>9222</string>
        <key>CHROME_CDP_URL</key>
        <string>http://192.168.64.1:9334</string>
    </dict>
    <key>StandardOutPath</key>
    <string>${PROJECT_PATH}/logs/nanoclaw.log</string>
    <key>StandardErrorPath</key>
    <string>${PROJECT_PATH}/logs/nanoclaw.error.log</string>
</dict>
</plist>
EOF
```

Create the host CDP bridge plist (required for host session reuse from containers):

```bash
cat > ~/Library/LaunchAgents/com.nanoclaw.cdp-bridge.plist << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.nanoclaw.cdp-bridge</string>
    <key>ProgramArguments</key>
    <array>
        <string>${NODE_PATH}</string>
        <string>${PROJECT_PATH}/scripts/cdp-bridge.mjs</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${PROJECT_PATH}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>${CONTAINER_PATH}:/usr/local/bin:/usr/bin:/bin:${HOME_PATH}/.local/bin</string>
        <key>HOME</key>
        <string>${HOME_PATH}</string>
        <key>CHROME_CDP_PORT</key>
        <string>9222</string>
        <key>CHROME_CDP_BRIDGE_PORT</key>
        <string>9334</string>
    </dict>
    <key>StandardOutPath</key>
    <string>${PROJECT_PATH}/logs/cdp-bridge.log</string>
    <key>StandardErrorPath</key>
    <string>${PROJECT_PATH}/logs/cdp-bridge.error.log</string>
</dict>
</plist>
EOF
```

Build and start:
```bash
npm run build
mkdir -p logs
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.nanoclaw.cdp-bridge.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.nanoclaw.plist
```

Verify:
```bash
launchctl list | grep nanoclaw
tail -f logs/cdp-bridge.log
tail -f logs/nanoclaw.log
```

## 11. Test

Send a message to your bot in Telegram. In your main channel, no prefix is needed—just send "hello".

## Service Management

```bash
# View logs
tail -f logs/nanoclaw.log

# Restart service
launchctl kickstart -k gui/$(id -u)/com.nanoclaw.cdp-bridge
launchctl kickstart -k gui/$(id -u)/com.nanoclaw

# Stop service
launchctl bootout gui/$(id -u)/com.nanoclaw
launchctl bootout gui/$(id -u)/com.nanoclaw.cdp-bridge

# Start service
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.nanoclaw.cdp-bridge.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.nanoclaw.plist
```

## Adding More Telegram Chats

1. Add the bot to a group or start a new private chat
2. Send `/chatid` to get the chat ID
3. Add to `data/registered_groups.json`:
   ```json
   {
     "tg:-1001234567890": {
       "name": "My Group",
       "folder": "my-group",
       "trigger": "@Claude",
       "added_at": "2025-02-09T00:00:00.000Z",
       "requiresTrigger": true
     }
   }
   ```
4. Create the folder: `mkdir -p groups/my-group/logs`
5. Restart: `launchctl kickstart -k gui/$(id -u)/com.nanoclaw`

### Group Privacy Setting

By default, Telegram bots in groups only see messages that @mention them. To let the bot see all messages:

1. Open `@BotFather` in Telegram
2. Send `/mybots` and select your bot
3. Go to **Bot Settings** > **Group Privacy** > **Turn off**
4. Remove and re-add the bot to the group

## Troubleshooting

### "Not logged in" error

The OAuth token variable name must be `CLAUDE_CODE_OAUTH_TOKEN` (not `ANTHROPIC_OAUTH_TOKEN`):
```bash
# Check .env
grep OAUTH .env

# Should show:
# CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat...
```

After fixing, sync and restart:
```bash
cp .env data/env/env
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

### Container command not found

The launchd PATH must include `/opt/homebrew/bin`. Regenerate the plist with the correct path (see step 10).

### Host browser sessions not reused

1. Verify bridge service is running:
   ```bash
   launchctl list | grep com.nanoclaw.cdp-bridge
   ```
2. Verify bridge endpoint:
   ```bash
   curl -s http://192.168.64.1:9334/json/version
   ```
3. Check bridge logs:
   ```bash
   tail -f logs/cdp-bridge.log
   tail -f logs/cdp-bridge.error.log
   ```
4. Restart both launchd agents:
   ```bash
   launchctl kickstart -k gui/$(id -u)/com.nanoclaw.cdp-bridge
   launchctl kickstart -k gui/$(id -u)/com.nanoclaw
   ```

### Bot not responding in groups

1. Check Group Privacy is disabled in BotFather
2. Verify the group is registered: `cat data/registered_groups.json`
3. Check logs: `tail -f logs/nanoclaw.log`

### Service won't start

Check error log:
```bash
cat logs/nanoclaw.error.log
```

Common issues:
- Apple Container not running: `container system start`
- Missing dependencies: `npm install`
- Build needed: `npm run build`
