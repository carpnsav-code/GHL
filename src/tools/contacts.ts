import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GHLClient } from "../client.js";
import { jsonResult } from "../util.js";

export function registerContactTools(server: McpServer, client: GHLClient) {
  server.registerTool(
    "ghl_list_contacts",
    {
      title: "List GHL contacts",
      description: "List/search contacts in the connected GoHighLevel sub-account.",
      inputSchema: {
        query: z.string().optional().describe("Free-text search (name, email, phone)"),
        limit: z.number().int().min(1).max(100).default(20),
        startAfterId: z.string().optional().describe("Pagination cursor: contact id to start after"),
      },
    },
    async ({ query, limit, startAfterId }) => {
      const data = await client.request("GET", "/contacts/", {
        query: { locationId: client.locationId, query, limit, startAfterId },
      });
      return jsonResult(data);
    },
  );

  server.registerTool(
    "ghl_get_contact",
    {
      title: "Get GHL contact",
      description: "Fetch a single contact by id.",
      inputSchema: { contactId: z.string() },
    },
    async ({ contactId }) => {
      const data = await client.request("GET", `/contacts/${contactId}`);
      return jsonResult(data);
    },
  );

  server.registerTool(
    "ghl_create_contact",
    {
      title: "Create GHL contact",
      description: "Create a new contact in the connected sub-account.",
      inputSchema: {
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        tags: z.array(z.string()).optional(),
        source: z.string().optional(),
      },
    },
    async (input) => {
      const data = await client.request("POST", "/contacts/", {
        body: { locationId: client.locationId, ...input },
      });
      return jsonResult(data);
    },
  );

  server.registerTool(
    "ghl_update_contact",
    {
      title: "Update GHL contact",
      description: "Update fields on an existing contact.",
      inputSchema: {
        contactId: z.string(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
      },
    },
    async ({ contactId, ...fields }) => {
      const data = await client.request("PUT", `/contacts/${contactId}`, { body: fields });
      return jsonResult(data);
    },
  );

  server.registerTool(
    "ghl_add_contact_tags",
    {
      title: "Add tags to GHL contact",
      description: "Add one or more tags to a contact.",
      inputSchema: { contactId: z.string(), tags: z.array(z.string()).min(1) },
    },
    async ({ contactId, tags }) => {
      const data = await client.request("POST", `/contacts/${contactId}/tags`, { body: { tags } });
      return jsonResult(data);
    },
  );

  server.registerTool(
    "ghl_remove_contact_tags",
    {
      title: "Remove tags from GHL contact",
      description: "Remove one or more tags from a contact.",
      inputSchema: { contactId: z.string(), tags: z.array(z.string()).min(1) },
    },
    async ({ contactId, tags }) => {
      const data = await client.request("DELETE", `/contacts/${contactId}/tags`, { body: { tags } });
      return jsonResult(data);
    },
  );
}
