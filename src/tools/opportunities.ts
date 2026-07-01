import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GHLClient } from "../client.js";
import { jsonResult } from "../util.js";

export function registerOpportunityTools(server: McpServer, client: GHLClient) {
  server.registerTool(
    "ghl_list_pipelines",
    {
      title: "List GHL pipelines",
      description: "List all sales pipelines (and their stages) in the connected sub-account.",
      inputSchema: {},
    },
    async () => {
      const data = await client.request("GET", "/opportunities/pipelines", {
        query: { locationId: client.locationId },
      });
      return jsonResult(data);
    },
  );

  server.registerTool(
    "ghl_list_opportunities",
    {
      title: "List GHL opportunities",
      description: "List/search opportunities (deals), optionally filtered by pipeline or status.",
      inputSchema: {
        pipelineId: z.string().optional(),
        status: z.enum(["open", "won", "lost", "abandoned", "all"]).optional(),
        query: z.string().optional().describe("Free-text search"),
        limit: z.number().int().min(1).max(100).default(20),
      },
    },
    async ({ pipelineId, status, query, limit }) => {
      const data = await client.request("GET", "/opportunities/search", {
        query: {
          location_id: client.locationId,
          pipeline_id: pipelineId,
          status,
          q: query,
          limit,
        },
      });
      return jsonResult(data);
    },
  );

  server.registerTool(
    "ghl_get_opportunity",
    {
      title: "Get GHL opportunity",
      description: "Fetch a single opportunity/deal by id.",
      inputSchema: { opportunityId: z.string() },
    },
    async ({ opportunityId }) => {
      const data = await client.request("GET", `/opportunities/${opportunityId}`);
      return jsonResult(data);
    },
  );

  server.registerTool(
    "ghl_create_opportunity",
    {
      title: "Create GHL opportunity",
      description: "Create a new opportunity/deal in a pipeline.",
      inputSchema: {
        pipelineId: z.string(),
        pipelineStageId: z.string(),
        name: z.string(),
        contactId: z.string().optional(),
        monetaryValue: z.number().optional(),
        status: z.enum(["open", "won", "lost", "abandoned"]).default("open"),
      },
    },
    async (input) => {
      const data = await client.request("POST", "/opportunities/", {
        body: { locationId: client.locationId, ...input },
      });
      return jsonResult(data);
    },
  );

  server.registerTool(
    "ghl_update_opportunity",
    {
      title: "Update GHL opportunity",
      description: "Update fields on an existing opportunity (e.g. move stage, change value).",
      inputSchema: {
        opportunityId: z.string(),
        name: z.string().optional(),
        pipelineStageId: z.string().optional(),
        monetaryValue: z.number().optional(),
        status: z.enum(["open", "won", "lost", "abandoned"]).optional(),
      },
    },
    async ({ opportunityId, ...fields }) => {
      const data = await client.request("PUT", `/opportunities/${opportunityId}`, { body: fields });
      return jsonResult(data);
    },
  );
}
