#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GHLClient, GHLError } from "./client.js";
import { registerContactTools } from "./tools/contacts.js";
import { registerOpportunityTools } from "./tools/opportunities.js";
import { registerCalendarTools } from "./tools/calendar.js";
import { registerConversationTools } from "./tools/conversations.js";

async function main() {
  const client = new GHLClient();

  const server = new McpServer({
    name: "ghl-mcp-server",
    version: "1.0.0",
  });

  registerContactTools(server, client);
  registerOpportunityTools(server, client);
  registerCalendarTools(server, client);
  registerConversationTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  if (err instanceof GHLError) {
    console.error(`GoHighLevel API error (${err.status}):`, err.body);
  } else {
    console.error("Fatal error starting ghl-mcp-server:", err);
  }
  process.exit(1);
});
