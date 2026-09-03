import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { sendCardLeadEmail, sendCardRescanEmail } from "@/lib/email";

export interface PublicContactCard {
  id: string;
  orgId: string;
  userId: string;
  slug: string;
  displayName: string;
  title: string | null;
  company: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  photoUrl: string | null;
  socialLinks: Record<string, string>;
  orgName: string;
  isActive: boolean;
}

/** Load a contact card by slug for the public-facing page. */
export async function getContactCardBySlug(slug: string): Promise<PublicContactCard | null> {
  const [row] = await db
    .select({
      id: schema.contactCards.id,
      orgId: schema.contactCards.orgId,
      userId: schema.contactCards.userId,
      slug: schema.contactCards.slug,
      displayName: schema.contactCards.displayName,
      title: schema.contactCards.title,
      company: schema.contactCards.company,
      phone: schema.contactCards.phone,
      whatsapp: schema.contactCards.whatsapp,
      email: schema.contactCards.email,
      photoUrl: schema.contactCards.photoUrl,
      socialLinks: schema.contactCards.socialLinks,
      orgName: schema.organizations.name,
      isActive: schema.contactCards.isActive,
    })
    .from(schema.contactCards)
    .innerJoin(schema.organizations, eq(schema.contactCards.orgId, schema.organizations.id))
    .where(and(eq(schema.contactCards.slug, slug), eq(schema.contactCards.isActive, true)))
    .limit(1);

  return row
    ? {
        ...row,
        socialLinks: (row.socialLinks as Record<string, string>) ?? {},
      }
    : null;
}

/** Record a card view for analytics. */
export async function recordCardView(contactCardId: string, deviceType?: string) {
  await db.insert(schema.cardViews).values({
    contactCardId,
    deviceType: deviceType ?? null,
  });
}

/** Build basic stats for a card: views and leads generated. */
export async function getContactCardStats(contactCardId: string) {
  const [{ viewCount }] = await db
    .select({ viewCount: sql<number>`count(*)::int` })
    .from(schema.cardViews)
    .where(eq(schema.cardViews.contactCardId, contactCardId));

  const [{ leadCount }] = await db
    .select({ leadCount: sql<number>`count(*)::int` })
    .from(schema.leads)
    .where(eq(schema.leads.contactCardId, contactCardId));

  return { viewCount, leadCount };
}

export interface CardLeadPayload {
  name: string;
  email: string;
  phone: string;
  company?: string | null;
}

export interface CardLeadResult {
  ok: true;
  type: "new" | "rescan";
  leadId: string;
}

/** Submit a lead from a public contact card form. Handles dedupe by email within the org. */
export async function submitCardLead(slug: string, payload: CardLeadPayload): Promise<CardLeadResult> {
  const card = await getContactCardBySlug(slug);
  if (!card) {
    throw new CardLeadError("Card not found", 404);
  }

  const normalizedEmail = payload.email.trim().toLowerCase();
  const normalizedPhone = payload.phone.trim();

  // Find the card owner and their email.
  const [owner] = await db
    .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, card.userId))
    .limit(1);

  if (!owner) {
    throw new CardLeadError("Card owner not found", 500);
  }

  // Look for an existing lead in the same org with a matching email (case-insensitive).
  const [existing] = await db
    .select({
      id: schema.leads.id,
      name: schema.leads.name,
      assigneeId: schema.leads.assigneeId,
      phone: schema.leads.phone,
      company: schema.leads.company,
    })
    .from(schema.leads)
    .where(
      and(
        eq(schema.leads.orgId, card.orgId),
        sql`LOWER(${schema.leads.email}) = ${normalizedEmail}`,
      ),
    )
    .limit(1);

  const appUrl = process.env.APP_URL ?? "https://xsta360.67-211-210-8.sslip.io";

  if (existing) {
    // Re-scan: add a remark and update activity timestamp.
    const remarkText = `Re-scanned ${card.displayName}'s contact card`;
    await db.insert(schema.remarks).values({
      leadId: existing.id,
      orgId: card.orgId,
      authorId: card.userId,
      body: remarkText,
    });

    await db
      .update(schema.leads)
      .set({ updatedAt: new Date() })
      .where(eq(schema.leads.id, existing.id));

    if (owner.email) {
      const leadUrl = `${appUrl}/leads/${existing.id}`;
      await sendCardRescanEmail({
        to: owner.email,
        repName: owner.name || card.displayName,
        leadName: existing.name,
        leadCompany: existing.company,
        cardName: card.displayName,
        leadUrl,
        appUrl,
      }).catch(() => {
        // Don't fail the submission if the email fails.
      });
    }

    return { ok: true, type: "rescan", leadId: existing.id };
  }

  // New lead: land in the first open pipeline stage.
  const [firstOpenStage] = await db
    .select({ id: schema.pipelineStages.id, name: schema.pipelineStages.name })
    .from(schema.pipelineStages)
    .where(
      and(
        eq(schema.pipelineStages.orgId, card.orgId),
        eq(schema.pipelineStages.kind, "open"),
      ),
    )
    .orderBy(schema.pipelineStages.position)
    .limit(1);

  const [newLead] = await db
    .insert(schema.leads)
    .values({
      orgId: card.orgId,
      name: payload.name.trim(),
      email: normalizedEmail,
      phone: normalizedPhone,
      company: payload.company?.trim() || null,
      source: "contact_card_scan",
      stageId: firstOpenStage?.id ?? null,
      assigneeId: card.userId,
      createdById: card.userId,
      contactCardId: card.id,
    })
    .returning();

  if (owner.email) {
    const leadUrl = `${appUrl}/leads/${newLead.id}`;
    await sendCardLeadEmail({
      to: owner.email,
      repName: owner.name || card.displayName,
      leadName: newLead.name,
      leadCompany: newLead.company,
      cardName: card.displayName,
      leadUrl,
      appUrl,
    }).catch(() => {
      // Don't fail the submission if the email fails.
    });
  }

  return { ok: true, type: "new", leadId: newLead.id };
}

export class CardLeadError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function startOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Daily stats for the current user's contact card. */
export async function getMyCardStats(userId: string, orgId: string) {
  const [card] = await db
    .select({ id: schema.contactCards.id, slug: schema.contactCards.slug, displayName: schema.contactCards.displayName })
    .from(schema.contactCards)
    .where(and(eq(schema.contactCards.userId, userId), eq(schema.contactCards.orgId, orgId)))
    .limit(1);

  if (!card) return null;

  const today = startOfDay();
  const [{ viewCount }] = await db
    .select({ viewCount: sql<number>`count(*)::int` })
    .from(schema.cardViews)
    .where(and(eq(schema.cardViews.contactCardId, card.id), gte(schema.cardViews.viewedAt, today)));

  const [{ leadCount }] = await db
    .select({ leadCount: sql<number>`count(*)::int` })
    .from(schema.leads)
    .where(and(eq(schema.leads.contactCardId, card.id), gte(schema.leads.createdAt, today)));

  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? "https://xsta360.67-211-210-8.sslip.io";
  return {
    ...card,
    cardUrl: `${appUrl}/c/${card.slug}`,
    viewCount,
    leadCount,
  };
}
