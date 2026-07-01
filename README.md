# GHL MCP Server

Connects Claude Code to your GoHighLevel (GHL) sub-account via a Private
Integration token, exposing contacts, pipelines/opportunities, calendar, and
conversations as tools you can ask Claude to use.

## 1. Create a Private Integration token in GHL

1. In GoHighLevel, go to **Settings > Other Settings > Private Integrations**.
2. Click **Create new Integration**, give it a name (e.g. "Claude Code").
3. Select scopes. At minimum, enable read/write for:
   - Contacts
   - Opportunities
   - Calendars / Calendar Events
   - Conversations / Conversations Messages
4. Save and **copy the token immediately** — GHL only shows it once.
5. Note your **Location ID** (sub-account ID), shown in Settings > Business
   Info, or in the URL when viewing that sub-account.

## 2. Install and build

```bash
npm install
npm run build
```

## 3. Configure credentials

Copy `.env.example` to `.env` and fill in your values (used only for local
testing — Claude Code will pass these as env vars directly, see below):

```bash
cp .env.example .env
```

## 4. Register the MCP server with Claude Code

```bash
claude mcp add ghl \
  --env GHL_API_TOKEN=your_private_integration_token \
  --env GHL_LOCATION_ID=your_location_id \
  -- node /absolute/path/to/GHL/dist/index.js
```

Restart Claude Code (or start a new session). You should now be able to ask
things like "list my open opportunities in GHL" or "text this contact" and
Claude will call the tools below directly.

## Available tools

**Contacts**
- `ghl_list_contacts`, `ghl_get_contact`, `ghl_create_contact`,
  `ghl_update_contact`, `ghl_add_contact_tags`, `ghl_remove_contact_tags`

**Pipelines & Opportunities**
- `ghl_list_pipelines`, `ghl_list_opportunities`, `ghl_get_opportunity`,
  `ghl_create_opportunity`, `ghl_update_opportunity`

**Calendar & Appointments**
- `ghl_list_calendars`, `ghl_list_appointments`, `ghl_get_appointment`,
  `ghl_get_free_slots`, `ghl_create_appointment`, `ghl_update_appointment`,
  `ghl_cancel_appointment`

**Conversations & Messaging**
- `ghl_list_conversations`, `ghl_get_conversation_messages`,
  `ghl_send_message`

## Notes

- The Private Integration token is scoped to a single sub-account (location),
  so there's no `locationId` parameter to pass around — it's read from
  `GHL_LOCATION_ID`.
- For proactive updates (e.g. "tell me every morning about new leads")
  outside of an active chat, you'd need a separate scheduled job (cron)
  that calls the GHL API and notifies you (email/Slack/SMS) — this server
  only handles on-demand tool calls made during a Claude Code session. Ask
  if you want that built too.
- GHL's API (`services.leadconnectorhq.com`, version `2021-07-28`) may
  change endpoint shapes over time; if a tool call errors with a 4xx from
  GHL, check the [official API docs](https://marketplace.gohighlevel.com/docs/)
  for the current schema.
