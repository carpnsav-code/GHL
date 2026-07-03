import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GHLClient } from "../client.js";
import { jsonResult, errorResult } from "../util.js";

const TZ = "America/Phoenix";

// Templates store the logo as a private GHL URL that the public estimate page
// (fastpaydirect.com) can't load, so it renders as a broken image. Override it
// with a publicly reachable logo URL. Configurable via env for portability.
const LOGO_URL =
  process.env.GHL_ESTIMATE_LOGO_URL ||
  "https://assets.cdn.filesafe.space/Xj7u5i7fbL5xWezHHamo/media/f5e6f073-75bd-4adc-bd02-5487dd3b5d2d.png";

function ymd(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function templateList(data: any): any[] {
  return data?.data || data?.templates || data?.estimateTemplates || [];
}

// The estimate "send" endpoint requires the id of the GHL user sending it.
// The Users API scope isn't always enabled, so resolve from the calendar's
// primary team member (Calendar scope) unless overridden.
async function resolveSenderUserId(client: GHLClient, explicit?: string): Promise<string> {
  if (explicit) return explicit;
  if (process.env.GHL_SENDER_USER_ID) return process.env.GHL_SENDER_USER_ID;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cals: any = await client.request("GET", "/calendars/", {
    query: { locationId: client.locationId },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const members: any[] = (cals?.calendars ?? []).flatMap((c: any) => c.teamMembers ?? []);
  const primary = members.find((m) => m.isPrimary) ?? members[0];
  if (!primary?.userId) {
    throw new Error(
      "Could not resolve a sender userId. Pass userId, or set GHL_SENDER_USER_ID.",
    );
  }
  return primary.userId;
}

export function registerEstimateTools(server: McpServer, client: GHLClient) {
  server.registerTool(
    "ghl_list_estimate_templates",
    {
      title: "List GHL estimate templates",
      description:
        "List the estimate (quote) templates configured in the connected sub-account, e.g. the polished concrete / epoxy systems.",
      inputSchema: {},
    },
    async () => {
      const data = await client.request("GET", "/invoices/estimate/template", {
        query: { altId: client.locationId, altType: "location", limit: "50", offset: "0" },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const templates = templateList(data).map((t: any) => ({
        id: t._id ?? t.id,
        name: t.name ?? t.title,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lineItems: (t.items ?? []).map((i: any) => ({
          name: i.name,
          defaultPricePerUnit: i.amount,
        })),
      }));
      return jsonResult(templates);
    },
  );

  server.registerTool(
    "ghl_send_estimate",
    {
      title: "Send GHL estimate",
      description:
        "Create an estimate from one of the sub-account's templates and send it to a contact. " +
        "For floor jobs: squareFootage is the quantity, pricePerSqFt is the price per unit. " +
        "By default this SENDS the estimate; pass draftOnly=true to create it without sending.",
      inputSchema: {
        contactId: z.string().describe("Contact to send the estimate to"),
        template: z
          .string()
          .describe('Template name or fragment, e.g. "800 grit", "grind and seal", "marble metallic"'),
        squareFootage: z.number().positive().describe("Square footage = line item quantity"),
        pricePerSqFt: z.number().positive().describe("Price per square foot = per-unit price"),
        sendVia: z.enum(["email", "sms", "sms_and_email"]).default("sms_and_email"),
        expiryDays: z.number().int().min(1).max(365).default(30),
        draftOnly: z.boolean().default(false).describe("Create the draft but do not send it"),
        userId: z.string().optional().describe("Override the sending GHL user id"),
      },
    },
    async ({ contactId, template, squareFootage, pricePerSqFt, sendVia, expiryDays, draftOnly, userId }) => {
      // 1. Find the template by name fragment.
      const tplData = await client.request("GET", "/invoices/estimate/template", {
        query: { altId: client.locationId, altType: "location", limit: "50", offset: "0" },
      });
      const templates = templateList(tplData);
      const needle = template.trim().toLowerCase();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tpl = templates.find((t: any) => (t.name ?? t.title ?? "").toLowerCase().includes(needle));
      if (!tpl) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const names = templates.map((t: any) => t.name ?? t.title).join(", ");
        return errorResult(`No estimate template matching "${template}". Available: ${names}`);
      }
      const item = (tpl.items ?? [])[0];
      if (!item?.productId || !item?.priceId) {
        return errorResult(`Template "${tpl.name}" has no usable line item to build an estimate from.`);
      }

      // 2. Resolve the contact's details.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const contactResp: any = await client.request("GET", `/contacts/${contactId}`);
      const contact = contactResp?.contact ?? contactResp;
      const contactDetails = {
        id: contactId,
        name:
          contact?.contactName ??
          [contact?.firstName, contact?.lastName].filter(Boolean).join(" ") ??
          "",
        email: contact?.email ?? undefined,
        phoneNo: contact?.phone ?? undefined,
      };

      // 3. Build + create the estimate (draft).
      const now = new Date();
      const currency = tpl.currency ?? item.currency ?? "USD";
      const body = {
        altId: client.locationId,
        altType: "location",
        name: tpl.name ?? "Estimate",
        currency,
        businessDetails: { ...(tpl.businessDetails ?? {}), logoUrl: LOGO_URL },
        items: [
          {
            name: item.name,
            description: item.description ?? "",
            currency,
            amount: pricePerSqFt,
            qty: squareFootage,
            productId: item.productId,
            priceId: item.priceId,
            taxInclusive: item.taxInclusive ?? false,
            type: item.type ?? "one_time",
            taxes: item.taxes ?? [],
          },
        ],
        discount: { value: 0, type: "percentage" },
        contactDetails,
        issueDate: ymd(now),
        expiryDate: ymd(new Date(now.getTime() + expiryDays * 86400000)),
        frequencySettings: { enabled: false },
        title: tpl.title ?? "ESTIMATE",
        // Carry the template's saved terms & conditions and number prefix.
        termsNotes: tpl.termsNotes,
        estimateNumberPrefix: tpl.estimateNumberPrefix,
        liveMode: true,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const created: any = await client.request("POST", "/invoices/estimate", { body });
      const estimateId = created?._id ?? created?.id;

      if (draftOnly) {
        return jsonResult({
          status: "draft_created",
          estimateId,
          estimateNumber: created?.estimateNumber,
          template: tpl.name,
          quantity: squareFootage,
          pricePerUnit: pricePerSqFt,
          total: created?.total,
          contact: contactDetails.name,
        });
      }

      // 4. Send it.
      const senderUserId = await resolveSenderUserId(client, userId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sent: any = await client.request("POST", `/invoices/estimate/${estimateId}/send`, {
        body: {
          altId: client.locationId,
          altType: "location",
          action: sendVia,
          liveMode: true,
          estimateName: tpl.name,
          userId: senderUserId,
        },
      });

      return jsonResult({
        status: sent?.estimateStatus ?? "sent",
        estimateId,
        estimateNumber: created?.estimateNumber,
        template: tpl.name,
        quantity: squareFootage,
        pricePerUnit: pricePerSqFt,
        total: created?.total,
        sentVia: sendVia,
        sentTo: { name: contactDetails.name, email: contactDetails.email, phone: contactDetails.phoneNo },
      });
    },
  );
}
