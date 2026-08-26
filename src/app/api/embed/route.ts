import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { logEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

// CORS preflight for embedded forms on other domains.
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

const EmbedSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(1, "Name is required"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  company: z.string().optional().or(z.literal("")),
  campaign: z.string().optional().or(z.literal("")),
  // Honeypot — must be empty for a human submission.
  website: z.string().optional().or(z.literal("")),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = Object.fromEntries(new URLSearchParams(await request.text()));
  }

  const parsed = EmbedSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400, headers: { "Access-Control-Allow-Origin": "*" } },
    );
  }

  const { token, name, email, phone, company, campaign, website } = parsed.data;

  // Honeypot: if filled, silently accept but do nothing (bot).
  if (website) {
    return Response.json({ ok: true }, { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  // Look up the org by form token.
  const [org] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.formToken, token))
    .limit(1);
  if (!org) {
    return Response.json({ ok: false, error: "Invalid form token" }, { status: 404 });
  }

  // Default to the first open stage.
  const [firstStage] = await db
    .select()
    .from(schema.pipelineStages)
    .where(and(eq(schema.pipelineStages.orgId, org.id), eq(schema.pipelineStages.kind, "open")))
    .orderBy(schema.pipelineStages.position)
    .limit(1);

  const [lead] = await db
    .insert(schema.leads)
    .values({
      orgId: org.id,
      name,
      email: email || null,
      phone: phone || null,
      company: company || null,
      campaign: campaign || null,
      source: "embedded_form",
      stageId: firstStage?.id,
    })
    .returning();

  await logEvent(org.id, "lead_created", {
    leadId: lead.id,
    meta: { source: "embedded_form", campaign: campaign || null, via: "embed" },
  });

  return Response.json(
    { ok: true, leadId: lead.id },
    { status: 201, headers: { "Access-Control-Allow-Origin": "*" } },
  );
}
