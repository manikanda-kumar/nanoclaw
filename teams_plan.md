# Microsoft Teams Bot Integration Plan

## Architecture Overview

Teams bots work via **Azure Bot Service** (ABS) as a message broker. Teams sends messages to ABS, ABS forwards them to your webhook endpoint. This is fundamentally different from WhatsApp (persistent WebSocket) and Telegram (polling) — Teams requires an **HTTPS endpoint** reachable from the internet.

```
Teams Client → Azure Bot Service → HTTPS webhook → NanoClaw
NanoClaw → Azure Bot Service → Teams Client
```

## Prerequisites

1. **Azure account** with an active subscription
2. **Microsoft 365 tenant** with Teams enabled (or a dev tenant from [Microsoft 365 Developer Program](https://developer.microsoft.com/en-us/microsoft-365/dev-program))
3. **Public HTTPS endpoint** — either:
   - A tunnel like `ngrok` / `cloudflared` for dev
   - A reverse proxy on a VPS for prod
4. **Node.js 18+** (already satisfied by NanoClaw)

## Step 1: Azure App Registration

1. Go to [Azure Portal](https://portal.azure.com) → **App registrations** → **New registration**
2. Name: `NanoClaw Teams Bot`
3. Supported account types: **Multitenant** (required for Teams)
4. Redirect URI: leave blank
5. After creation, note the **Application (client) ID**
6. Go to **Certificates & secrets** → **New client secret** → copy the **Value**

## Step 2: Create Azure Bot Resource

1. Azure Portal → **Create a resource** → search **Azure Bot**
2. Fill in:
   - Bot handle: `nanoclaw-teams`
   - Pricing: **Free (F0)** tier
   - Microsoft App ID: paste the App ID from Step 1
   - App type: **Multi Tenant**
3. After creation → **Channels** → add **Microsoft Teams**
4. Go to **Configuration** → set **Messaging endpoint** to:
   ```
   https://your-domain.com/api/teams/messages
   ```

## Step 3: Install Dependencies

```bash
npm install botbuilder @microsoft/agents-core
```

The [Microsoft 365 Agents SDK](https://learn.microsoft.com/en-us/microsoft-365/agents-sdk/agents-sdk-overview) is the current recommended SDK (Bot Framework v4 was deprecated Dec 2025). However, `botbuilder` v4 still works and has simpler Node.js ergonomics. For a channel integration this lightweight, `botbuilder` is fine.

## Step 4: Implement `src/channels/teams.ts`

Following NanoClaw's existing pattern (JID prefix routing, same as `tg:` for Telegram):

```typescript
// src/channels/teams.ts
import {
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
  TurnContext,
  Activity,
  ConversationReference,
} from "botbuilder";
import express from "express";
import { OnInboundMessage, OnChatMetadata, NewMessage } from "../types";

const TEAMS_JID_PREFIX = "teams:";

export function teamsJid(conversationId: string): string {
  return `${TEAMS_JID_PREFIX}${conversationId}`;
}

export function isTeamsJid(jid: string): boolean {
  return jid.startsWith(TEAMS_JID_PREFIX);
}

let adapter: CloudAdapter;
let conversationRefs: Map<string, Partial<ConversationReference>> = new Map();
let connected = false;

export async function connectTeams(
  appId: string,
  appPassword: string,
  app: express.Express,
  onMessage: OnInboundMessage,
  onMeta: OnChatMetadata,
) {
  const auth = new ConfigurationBotFrameworkAuthentication({
    MicrosoftAppId: appId,
    MicrosoftAppPassword: appPassword,
    MicrosoftAppType: "MultiTenant",
  });

  adapter = new CloudAdapter(auth);

  // Error handler
  adapter.onTurnError = async (context, error) => {
    console.error(`[Teams] Error: ${error.message}`);
  };

  // Mount webhook endpoint
  app.post("/api/teams/messages", async (req, res) => {
    await adapter.process(req, res, async (context: TurnContext) => {
      if (context.activity.type === "message" && context.activity.text) {
        const convId = context.activity.conversation.id;
        const jid = teamsJid(convId);
        const senderName =
          context.activity.from.name || context.activity.from.id;

        // Store conversation reference for proactive messaging
        conversationRefs.set(
          convId,
          TurnContext.getConversationReference(context.activity),
        );

        const isGroup =
          context.activity.conversation.conversationType !== "personal";

        onMeta(jid, Date.now(), context.activity.conversation.name, "teams", isGroup);

        const msg: NewMessage = {
          key: { id: context.activity.id },
          sender: senderName,
          text: context.activity.text,
          timestamp: new Date(context.activity.timestamp).getTime(),
        };
        onMessage(jid, msg);
      }
    });
  });

  connected = true;
  console.log("[Teams] Bot webhook registered at /api/teams/messages");
}

export async function sendTeamsMessage(jid: string, text: string) {
  const convId = jid.replace(TEAMS_JID_PREFIX, "");
  const ref = conversationRefs.get(convId);
  if (!ref) {
    console.error(`[Teams] No conversation reference for ${convId}`);
    return;
  }

  await adapter.continueConversationAsync(
    process.env.TEAMS_APP_ID!,
    ref,
    async (context) => {
      // Teams supports 28KB per message; split if needed
      const MAX_LEN = 25000;
      for (let i = 0; i < text.length; i += MAX_LEN) {
        await context.sendActivity(text.slice(i, i + MAX_LEN));
      }
    },
  );
}

export async function setTeamsTyping(jid: string) {
  const convId = jid.replace(TEAMS_JID_PREFIX, "");
  const ref = conversationRefs.get(convId);
  if (!ref) return;

  await adapter.continueConversationAsync(
    process.env.TEAMS_APP_ID!,
    ref,
    async (context) => {
      await context.sendActivity({ type: "typing" });
    },
  );
}

export function isTeamsConnected(): boolean {
  return connected;
}

export function stopTeams() {
  connected = false;
}
```

## Step 5: Wire into `src/index.ts`

Add JID-prefix branches (same pattern as Telegram):

```typescript
// In sendMessage():
if (jid.startsWith("teams:")) {
  await sendTeamsMessage(jid, text);
  return;
}

// In setTyping():
if (jid.startsWith("teams:")) {
  await setTeamsTyping(jid);
  return;
}

// In main():
if (process.env.TEAMS_APP_ID && process.env.TEAMS_APP_PASSWORD) {
  const express = require("express");
  const app = express();
  app.use(express.json());
  await connectTeams(
    process.env.TEAMS_APP_ID,
    process.env.TEAMS_APP_PASSWORD,
    app,
    onInboundMessage,  // existing callback
    storeChatMetadata, // existing callback
  );
  const port = process.env.TEAMS_PORT || 3978;
  app.listen(port, () => console.log(`[Teams] Listening on port ${port}`));
}
```

## Step 6: Environment Variables

Add to `.env`:

```bash
TEAMS_APP_ID=<from Azure App Registration>
TEAMS_APP_PASSWORD=<client secret from Azure>
TEAMS_PORT=3978  # default Bot Framework port
```

## Step 7: Expose HTTPS Endpoint

**For development:**
```bash
ngrok http 3978
# Copy the https URL → update Azure Bot Configuration messaging endpoint
```

**For production:** Add to your reverse proxy (nginx/caddy):
```
# Caddy example
your-domain.com {
    reverse_proxy /api/teams/* localhost:3978
}
```

## Step 8: Create Teams App Manifest

Create `teams-manifest/manifest.json`:

```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/teams/v1.16/MicrosoftTeams.schema.json",
  "manifestVersion": "1.16",
  "version": "1.0.0",
  "id": "<TEAMS_APP_ID>",
  "developer": { "name": "You" },
  "name": { "short": "NanoClaw" },
  "description": { "short": "AI Assistant", "full": "NanoClaw AI Assistant" },
  "bots": [{
    "botId": "<TEAMS_APP_ID>",
    "scopes": ["personal", "team", "groupChat"]
  }]
}
```

Sideload via Teams Admin Center or upload as a custom app in Teams.

## Step 9: Register the Teams Chat

Once the bot receives its first message, the JID (`teams:<conversationId>`) gets stored via `storeChatMetadata()`. Register the group:

```bash
# From the main group, tell NanoClaw:
@NanoClaw register group "My Team" teams:<conversationId>
```

Or register via IPC/DB directly.

## Key Differences from WhatsApp/Telegram

| Aspect | WhatsApp | Telegram | Teams |
|--------|----------|----------|-------|
| Protocol | WebSocket (Baileys) | HTTP polling (grammy) | HTTP webhook (Bot Framework) |
| Auth | QR code scan | Bot token | Azure AD + client secret |
| Requires public URL | No | No | **Yes** |
| Message format | Text + media | Text + media | Text + Adaptive Cards |
| Typing indicator | Presence update | Chat action | Activity type |
| Cost | Free | Free | Free (F0 tier) |

## Optional Enhancements

- **Adaptive Cards**: Rich formatted responses instead of plain text
- **Conversation reference persistence**: Save `conversationRefs` to SQLite so proactive messages survive restarts
- **File/image support**: Handle Teams attachments → pass to container agent
- **@mention handling**: Strip bot @mentions from message text before processing

## References

- [Microsoft 365 Agents SDK Overview](https://learn.microsoft.com/en-us/microsoft-365/agents-sdk/agents-sdk-overview)
- [Build a bot for Teams](https://learn.microsoft.com/en-us/microsoftteams/platform/bots/build-a-bot)
- [Getting Started with M365 Agents SDK](https://spknowledge.com/2026/01/07/getting-started-with-m365-agents-sdk/)
- [Teams SDK Evolution Guidance](https://www.voitanos.io/blog/microsoft-teams-sdk-evolution-2025/)
- [Bot Framework JS Reference](https://learn.microsoft.com/en-us/javascript/api/overview/agents-overview?view=agents-sdk-js-latest)
