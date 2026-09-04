import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";

export interface CategoryWithStats {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  linkedSequenceId: string | null;
  linkedSequenceName: string | null;
  defaultAssigneeId: string | null;
  defaultAssigneeName: string | null;
  followUpCadenceDays: number | null;
  active: boolean;
  leadCount: number;
  createdAt: Date;
}

/**
 * Get all categories for an org with lead counts and linked sequence/assignee names.
 */
export async function getOrgCategories(orgId: string): Promise<CategoryWithStats[]> {
  const categories = await db
    .select()
    .from(schema.leadCategories)
    .where(eq(schema.leadCategories.orgId, orgId))
    .orderBy(desc(schema.leadCategories.createdAt));

  if (categories.length === 0) return [];

  // Get lead counts per category.
  const counts = await db
    .select({
      categoryId: schema.leadCategoryAssignments.categoryId,
    })
    .from(schema.leadCategoryAssignments)
    .where(eq(schema.leadCategoryAssignments.orgId, orgId));

  const countMap = new Map<string, number>();
  for (const c of counts) {
    countMap.set(c.categoryId, (countMap.get(c.categoryId) ?? 0) + 1);
  }

  // Get linked sequence names.
  const sequenceIds = categories.map((c) => c.linkedSequenceId).filter(Boolean) as string[];
  let sequenceMap = new Map<string, string>();
  if (sequenceIds.length > 0) {
    const sequences = await db
      .select({ id: schema.sequences.id, name: schema.sequences.name })
      .from(schema.sequences)
      .where(inArray(schema.sequences.id, sequenceIds));
    sequenceMap = new Map(sequences.map((s) => [s.id, s.name]));
  }

  // Get default assignee names.
  const assigneeIds = categories.map((c) => c.defaultAssigneeId).filter(Boolean) as string[];
  let assigneeMap = new Map<string, string>();
  if (assigneeIds.length > 0) {
    const assignees = await db
      .select({ id: schema.users.id, name: schema.users.name })
      .from(schema.users)
      .where(inArray(schema.users.id, assigneeIds));
    assigneeMap = new Map(assignees.map((a) => [a.id, a.name]));
  }

  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    color: c.color,
    icon: c.icon,
    linkedSequenceId: c.linkedSequenceId,
    linkedSequenceName: c.linkedSequenceId ? sequenceMap.get(c.linkedSequenceId) ?? null : null,
    defaultAssigneeId: c.defaultAssigneeId,
    defaultAssigneeName: c.defaultAssigneeId ? assigneeMap.get(c.defaultAssigneeId) ?? null : null,
    followUpCadenceDays: c.followUpCadenceDays,
    active: c.active,
    leadCount: countMap.get(c.id) ?? 0,
    createdAt: c.createdAt,
  }));
}

/**
 * Get categories assigned to a specific lead.
 */
export async function getLeadCategories(orgId: string, leadId: string): Promise<CategoryWithStats[]> {
  const assignments = await db
    .select({
      categoryId: schema.leadCategoryAssignments.categoryId,
    })
    .from(schema.leadCategoryAssignments)
    .where(
      and(
        eq(schema.leadCategoryAssignments.orgId, orgId),
        eq(schema.leadCategoryAssignments.leadId, leadId),
      ),
    );

  if (assignments.length === 0) return [];

  const categoryIds = assignments.map((a) => a.categoryId);
  const categories = await db
    .select()
    .from(schema.leadCategories)
    .where(inArray(schema.leadCategories.id, categoryIds));

  // Get linked sequence names.
  const sequenceIds = categories.map((c) => c.linkedSequenceId).filter(Boolean) as string[];
  let sequenceMap = new Map<string, string>();
  if (sequenceIds.length > 0) {
    const sequences = await db
      .select({ id: schema.sequences.id, name: schema.sequences.name })
      .from(schema.sequences)
      .where(inArray(schema.sequences.id, sequenceIds));
    sequenceMap = new Map(sequences.map((s) => [s.id, s.name]));
  }

  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    color: c.color,
    icon: c.icon,
    linkedSequenceId: c.linkedSequenceId,
    linkedSequenceName: c.linkedSequenceId ? sequenceMap.get(c.linkedSequenceId) ?? null : null,
    defaultAssigneeId: c.defaultAssigneeId,
    defaultAssigneeName: null,
    followUpCadenceDays: c.followUpCadenceDays,
    active: c.active,
    leadCount: 0,
    createdAt: c.createdAt,
  }));
}

/**
 * Get a single category by ID.
 */
export async function getCategory(orgId: string, categoryId: string) {
  const [cat] = await db
    .select()
    .from(schema.leadCategories)
    .where(
      and(eq(schema.leadCategories.id, categoryId), eq(schema.leadCategories.orgId, orgId)),
    )
    .limit(1);
  return cat ?? null;
}

/**
 * Get all lead IDs in a category (for bulk operations).
 */
export async function getLeadIdsInCategory(orgId: string, categoryId: string): Promise<string[]> {
  const rows = await db
    .select({ leadId: schema.leadCategoryAssignments.leadId })
    .from(schema.leadCategoryAssignments)
    .where(
      and(
        eq(schema.leadCategoryAssignments.orgId, orgId),
        eq(schema.leadCategoryAssignments.categoryId, categoryId),
      ),
    );
  return rows.map((r) => r.leadId);
}
