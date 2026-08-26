"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { verifySession, can } from "@/lib/dal";
import { nanoid } from "nanoid";

export type TeamFormState = { errors?: Record<string, string[]>; message?: string; ok?: boolean };

const InviteSchema = z.object({
  email: z.email("Please enter a valid email").trim().toLowerCase(),
  role: z.enum(["admin", "manager", "rep"]),
});

const RoleSchema = z.object({
  membershipId: z.string().uuid(),
  role: z.enum(["admin", "manager", "rep"]),
});

export async function inviteMember(
  _prev: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };
  if (!can(ctx, "manage_team")) return { message: "Only admins can invite members" };

  const parsed = InviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return {
      errors: parsed.error.issues.reduce<Record<string, string[]>>((acc, i) => {
        const key = i.path[0]?.toString() ?? "_";
        (acc[key] ??= []).push(i.message);
        return acc;
      }, {}),
    };
  }

  const { email, role } = parsed.data;

  // If the user already exists and is already a member, skip.
  const [existingUser] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  if (existingUser) {
    const [existingMembership] = await db
      .select()
      .from(schema.memberships)
      .where(
        and(eq(schema.memberships.orgId, ctx.orgId), eq(schema.memberships.userId, existingUser.id)),
      )
      .limit(1);
    if (existingMembership) {
      return { message: "That person is already a member of this organization." };
    }
  }

  // Create an invitation row (the accept flow is handled at /invite/[token]).
  await db.insert(schema.invitations).values({
    orgId: ctx.orgId,
    email,
    role,
    token: nanoid(32),
    invitedBy: ctx.userId,
  });

  revalidatePath("/settings");
  return { ok: true, message: `Invitation sent to ${email}` };
}

export async function changeRole(
  _prev: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };
  if (!can(ctx, "manage_team")) return { message: "Only admins can change roles" };

  const parsed = RoleSchema.safeParse({
    membershipId: formData.get("membershipId"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { errors: { role: ["Invalid role"] } };
  }

  // Confirm the membership belongs to this org.
  const [membership] = await db
    .select()
    .from(schema.memberships)
    .where(
      and(eq(schema.memberships.id, parsed.data.membershipId), eq(schema.memberships.orgId, ctx.orgId)),
    )
    .limit(1);
  if (!membership) return { message: "Membership not found" };

  await db
    .update(schema.memberships)
    .set({ role: parsed.data.role })
    .where(eq(schema.memberships.id, membership.id));

  revalidatePath("/settings");
  return { ok: true };
}

export async function removeMember(
  _prev: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };
  if (!can(ctx, "manage_team")) return { message: "Only admins can remove members" };

  const membershipId = String(formData.get("membershipId"));

  const [membership] = await db
    .select()
    .from(schema.memberships)
    .where(
      and(eq(schema.memberships.id, membershipId), eq(schema.memberships.orgId, ctx.orgId)),
    )
    .limit(1);
  if (!membership) return { message: "Membership not found" };
  if (membership.userId === ctx.userId) return { message: "You can't remove yourself" };

  await db.delete(schema.memberships).where(eq(schema.memberships.id, membership.id));

  revalidatePath("/settings");
  return { ok: true };
}
