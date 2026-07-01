import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GHLClient } from "../client.js";
import { jsonResult } from "../util.js";

export function registerCalendarTools(server: McpServer, client: GHLClient) {
  server.registerTool(
    "ghl_list_calendars",
    {
      title: "List GHL calendars",
      description: "List calendars configured in the connected sub-account.",
      inputSchema: {},
    },
    async () => {
      const data = await client.request("GET", "/calendars/", { query: { locationId: client.locationId } });
      return jsonResult(data);
    },
  );

  server.registerTool(
    "ghl_list_appointments",
    {
      title: "List GHL appointments",
      description: "List calendar events/appointments in a time range, optionally for one calendar.",
      inputSchema: {
        startTime: z.string().describe("ISO 8601 or epoch millis start of range"),
        endTime: z.string().describe("ISO 8601 or epoch millis end of range"),
        calendarId: z.string().optional(),
        userId: z.string().optional(),
      },
    },
    async ({ startTime, endTime, calendarId, userId }) => {
      const data = await client.request("GET", "/calendars/events", {
        query: { locationId: client.locationId, startTime, endTime, calendarId, userId },
      });
      return jsonResult(data);
    },
  );

  server.registerTool(
    "ghl_get_appointment",
    {
      title: "Get GHL appointment",
      description: "Fetch a single appointment/event by id.",
      inputSchema: { appointmentId: z.string() },
    },
    async ({ appointmentId }) => {
      const data = await client.request("GET", `/calendars/events/appointments/${appointmentId}`);
      return jsonResult(data);
    },
  );

  server.registerTool(
    "ghl_get_free_slots",
    {
      title: "Get GHL calendar free slots",
      description: "Check available booking slots for a calendar between two dates.",
      inputSchema: {
        calendarId: z.string(),
        startDate: z.string().describe("Epoch millis or ISO date"),
        endDate: z.string().describe("Epoch millis or ISO date"),
        timezone: z.string().optional(),
      },
    },
    async ({ calendarId, startDate, endDate, timezone }) => {
      const data = await client.request("GET", `/calendars/${calendarId}/free-slots`, {
        query: { startDate, endDate, timezone },
      });
      return jsonResult(data);
    },
  );

  server.registerTool(
    "ghl_create_appointment",
    {
      title: "Create GHL appointment",
      description: "Book a new appointment on a calendar for a contact.",
      inputSchema: {
        calendarId: z.string(),
        contactId: z.string(),
        startTime: z.string().describe("ISO 8601 start time"),
        endTime: z.string().describe("ISO 8601 end time"),
        title: z.string().optional(),
        appointmentStatus: z.enum(["confirmed", "new", "cancelled"]).default("confirmed"),
      },
    },
    async (input) => {
      const data = await client.request("POST", "/calendars/events/appointments", {
        body: { locationId: client.locationId, ...input },
      });
      return jsonResult(data);
    },
  );

  server.registerTool(
    "ghl_update_appointment",
    {
      title: "Update GHL appointment",
      description: "Reschedule or update an existing appointment.",
      inputSchema: {
        appointmentId: z.string(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
        title: z.string().optional(),
        appointmentStatus: z.enum(["confirmed", "new", "cancelled", "showed", "noshow"]).optional(),
      },
    },
    async ({ appointmentId, ...fields }) => {
      const data = await client.request("PUT", `/calendars/events/appointments/${appointmentId}`, {
        body: fields,
      });
      return jsonResult(data);
    },
  );

  server.registerTool(
    "ghl_cancel_appointment",
    {
      title: "Cancel GHL appointment",
      description: "Cancel an existing appointment.",
      inputSchema: { appointmentId: z.string() },
    },
    async ({ appointmentId }) => {
      const data = await client.request("PUT", `/calendars/events/appointments/${appointmentId}`, {
        body: { appointmentStatus: "cancelled" },
      });
      return jsonResult(data);
    },
  );
}
