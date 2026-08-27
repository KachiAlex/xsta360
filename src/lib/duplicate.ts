import "server-only";
import { and, eq, ilike } from "drizzle-orm";
import { db, schema } from "@/db";

export interface DuplicateMatch {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  matchField: "email" | "phone" | "name_company";
  createdAt: Date;
}

/**
 * Check for potential duplicate leads in an org before creating a new one.
 * Matches on: exact email, exact phone, or name+company combo.
 */
export async function checkDuplicates(
  orgId: string,
  data: { email?: string; phone?: string; name: string; company?: string },
): Promise<DuplicateMatch[]> {
  const matches: DuplicateMatch[] = [];
  const seen = new Set<string>();

  // Check by email
  if (data.email) {
    const emailMatches = await db
      .select({
        id: schema.leads.id,
        name: schema.leads.name,
        company: schema.leads.company,
        email: schema.leads.email,
        phone: schema.leads.phone,
        createdAt: schema.leads.createdAt,
      })
      .from(schema.leads)
      .where(
        and(
          eq(schema.leads.orgId, orgId),
          ilike(schema.leads.email, data.email),
        ),
      )
      .limit(5);

    for (const m of emailMatches) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        matches.push({ ...m, matchField: "email" });
      }
    }
  }

  // Check by phone
  if (data.phone) {
    const phoneMatches = await db
      .select({
        id: schema.leads.id,
        name: schema.leads.name,
        company: schema.leads.company,
        email: schema.leads.email,
        phone: schema.leads.phone,
        createdAt: schema.leads.createdAt,
      })
      .from(schema.leads)
      .where(
        and(
          eq(schema.leads.orgId, orgId),
          eq(schema.leads.phone, data.phone),
        ),
      )
      .limit(5);

    for (const m of phoneMatches) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        matches.push({ ...m, matchField: "phone" });
      }
    }
  }

  // Check by name + company
  if (data.company) {
    const nameCompanyMatches = await db
      .select({
        id: schema.leads.id,
        name: schema.leads.name,
        company: schema.leads.company,
        email: schema.leads.email,
        phone: schema.leads.phone,
        createdAt: schema.leads.createdAt,
      })
      .from(schema.leads)
      .where(
        and(
          eq(schema.leads.orgId, orgId),
          ilike(schema.leads.name, data.name),
          ilike(schema.leads.company, data.company),
        ),
      )
      .limit(5);

    for (const m of nameCompanyMatches) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        matches.push({ ...m, matchField: "name_company" });
      }
    }
  }

  return matches;
}
