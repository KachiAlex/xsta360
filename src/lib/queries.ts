import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

/** Load an org's pipeline stages ordered by position. */
export async function getOrgStages(orgId: string) {
  return db
    .select()
    .from(schema.pipelineStages)
    .where(eq(schema.pipelineStages.orgId, orgId))
    .orderBy(asc(schema.pipelineStages.position));
}

/** Load an org's lost reasons ordered by position. */
export async function getOrgLostReasons(orgId: string) {
  return db
    .select()
    .from(schema.lostReasons)
    .where(eq(schema.lostReasons.orgId, orgId))
    .orderBy(asc(schema.lostReasons.position));
}

/** Load an org's members (user + role) for assignment dropdowns. */
export async function getOrgMembers(orgId: string) {
  return db
    .select({
      membershipId: schema.memberships.id,
      userId: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.memberships.role,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(eq(schema.memberships.orgId, orgId));
}
