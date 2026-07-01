import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GHLClient } from "../client.js";
import { jsonResult } from "../util.js";

export function registerConversationTools(server: McpServer, client: GHLClient) {
  server.registerTool(
    "ghl_list_conversations",
    {
      title: "List GHL conversations",
      description: "List conversation threads, optionally filtered to one contact.",
      inputSchema: {
        contactId: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(20),
      },
    },
    async ({ contactId, limit }) => {
      const data = await client.request("GET", "/conversations/search", {
        query: { locationId: client.locationId, contactId, limit },
      });
      return jsonResult(data);
    },
  );

  server.registerTool(
    "ghl_get_conversation_messages",
    {
      title: "Get GHL conversation messages",
      description: "Fetch the message history for a conversation thread.",
      inputSchema: {
        conversationId: z.string(),
        limit: z.number().int().min(1).max(100).default(20),
      },
    },
    async ({ conversationId, limit }) => {
      const data = await client.request("GET", `/conversations/${conversationId}/messages`, {
        query: { limit },
      });
      return jsonResult(data);
    },
  );

  server.registerTool(
    "ghl_send_message",
    {
      title: "Send GHL message",
      description: "Send an SMS or Email to a contact, creating a conversation if needed.",
      inputSchema: {
        contactId: z.string(),
        type: z.enum(["SMS", "Email"]),
        message: z.string().describe("Message body (SMS text, or Email body)"),
        subject: z.string().optional().describe("Email subject (required for type=Email)"),
      },
    },
    async ({ contactId, type, message, subject }) => {
      const data = await client.request("POST", "/conversations/messages", {
        body: {
          contactId,
          type,
          message,
          ...(type === "Email" ? { subject } : {}),
        },
      });
      return jsonResult(data);
    },
  );
}
