import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export interface PublicContactCard {
  id: string;
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
