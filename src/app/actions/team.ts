"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { and, count, eq, isNull, gt } from "drizzle-orm";
import { db, schema } from "@/db";
import { verifySession, can, getOrgBilling, getPlanMaxMembers } from "@/lib/dal";
import { logEvent } from "@/lib/audit";
import { setOrg } from "@/lib/session";
import { nanoid } from "nanoid";

export type TeamFormState = {
  errors?: Record<string, string[]>;
  message?: string;
  ok?: boolean;
  inviteUrl?: string;
};

const InviteSchema = z.object({
  email: z.email("Please enter a valid email").trim().toLowerCase(),
  role: z.enum(["admin", "manager", "rep"]),
});

const RoleSchema = z.object({
  membershipId: z.string().uuid(),
  role: z.enum(["admin", "manager", "rep"]),
});

const TokenSchema = z.string().min(10);

const appUrl = () => (process.env.APP_URL || "").replace(/\/$/, "");

// Accepts either the db client or a transaction.
type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

async function adminCount(tx: DbOrTx, orgId: string) {
  const [{ value }] = await tx
    .select({ value: count() })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.role, "admin")));
  return value;
}

// ---------------------------------------------------------------------------
// Create an email-bound invitation and return the copyable join link.
// ---------------------------------------------------------------------------

export async function inviteMember(
  _prev: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };
  if (!can(ctx, "manage_team")) return { message: "Only admins can invite members" };

  // Plan seat limit — inviting beyond max_members requires an upgrade.
  const billing = await getOrgBilling(ctx.orgId);
  const maxMembers = getPlanMaxMembers(billing.plan);
  if (maxMembers !== null && billing.memberCount >= maxMembers) {
    return {
      message: `Your ${billing.plan.planName} plan allows up to ${maxMembers} member${maxMembers !== 1 ? "s" : ""}. Upgrade your plan on the Billing page to add more.`,
    };
  }

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
      return { message: "That person is already a member of this workspace." };
    }
  }

  // Prevent duplicate pending invitations to the same email.
  const [existingInvite] = await db
    .select()
    .from(schema.invitations)
    .where(
      and(
        eq(schema.invitations.orgId, ctx.orgId),
        eq(schema.invitations.email, email),
        isNull(schema.invitations.acceptedAt),
      ),
    )
    .limit(1);

  if (existingInvite) {
    // If it's still valid, don't create a new one.
    if (existingInvite.expiresAt && existingInvite.expiresAt > new Date()) {
      return { message: "An invitation has already been sent to this email" };
    }
  }

  const token = nanoid(32);
  const inviteUrl = `${appUrl()}/join/${token}`;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db.insert(schema.invitations).values({
    orgId: ctx.orgId,
    email,
    role,
    token,
    invitedBy: ctx.userId,
    expiresAt,
  });

  await logEvent(ctx.orgId, "member_invited", { actorId: ctx.userId, meta: { email, role } });

  revalidatePath("/settings");
  return { ok: true, inviteUrl, message: `Invitation link created for ${email}` };
}

// ---------------------------------------------------------------------------
// Join a workspace from an invite link (for authenticated users).
// ---------------------------------------------------------------------------

export async function acceptInvite(
  _prev: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };

  const token = String(formData.get("token") ?? "");
  if (!TokenSchema.safeParse(token).success) {
    return { message: "Invalid invitation link" };
  }

  const [invite] = await db
    .select()
    .from(schema.invitations)
    .where(eq(schema.invitations.token, token))
    .limit(1);

  if (!invite) return { message: "Invitation not found" };
  if (invite.acceptedAt) return { message: "Invitation already used" };
  if (invite.expiresAt < new Date()) return { message: "Invitation has expired" };

  const [user] = await db
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, ctx.userId))
    .limit(1);

  if (!user || user.email !== invite.email) {
    return { message: "This invitation is for a different email address" };
  }

  const [existing] = await db
    .select()
    .from(schema.memberships)
    .where(and(eq(schema.memberships.orgId, invite.orgId), eq(schema.memberships.userId, ctx.userId)))
    .limit(1);

  if (existing) {
    return { message: "You are already a member of this workspace" };
  }

  // Enforce the inviting org's plan seat limit.
  const inviteBilling = await getOrgBilling(invite.orgId);
  const inviteMax = getPlanMaxMembers(inviteBilling.plan);
  if (inviteMax !== null && inviteBilling.memberCount >= inviteMax) {
    return { message: "This workspace is at its plan's member limit. Ask the admin to upgrade." };
  }

  await db.transaction(async (tx) => {
    // Atomically claim the invitation — prevents double-accept.
    const [updated] = await tx
      .update(schema.invitations)
      .set({ acceptedAt: new Date() })
      .where(
        and(
          eq(schema.invitations.id, invite.id),
          isNull(schema.invitations.acceptedAt),
          gt(schema.invitations.expiresAt, new Date()),
        ),
      )
      .returning();
    if (!updated) throw new Error("Invitation already used or expired");

    await tx.insert(schema.memberships).values({
      orgId: invite.orgId,
      userId: ctx.userId,
      role: invite.role,
    });
  });

  await logEvent(invite.orgId, "member_joined", { actorId: ctx.userId, meta: { role: invite.role } });
  await setOrg(invite.orgId, invite.role);

  redirect("/dashboard");
}

// ---------------------------------------------------------------------------
// Revoke a pending invitation.
// ---------------------------------------------------------------------------

export async function revokeInvite(
  _prev: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };
  if (!can(ctx, "manage_team")) return { message: "Only admins can revoke invitations" };

  const invitationId = String(formData.get("invitationId") ?? "");
  if (!z.string().uuid().safeParse(invitationId).success) {
    return { message: "Invalid invitation" };
  }

  const [invitation] = await db
    .select()
    .from(schema.invitations)
    .where(and(eq(schema.invitations.id, invitationId), eq(schema.invitations.orgId, ctx.orgId)))
    .limit(1);

  if (!invitation) return { message: "Invitation not found" };
  if (invitation.acceptedAt) return { message: "Invitation already accepted" };

  await db.delete(schema.invitations).where(and(eq(schema.invitations.id, invitation.id), eq(schema.invitations.orgId, ctx.orgId)));

  revalidatePath("/settings");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Change a member's role.
// ---------------------------------------------------------------------------

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

  if (parsed.data.role !== "admin") {
    if (membership.userId === ctx.userId) {
      return { message: "Admins can't demote themselves" };
    }
  }

  // Wrap in transaction to prevent last-admin race condition.
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(schema.memberships)
        .set({ role: parsed.data.role })
        .where(and(eq(schema.memberships.id, membership.id), eq(schema.memberships.orgId, ctx.orgId)));

      // Re-check admin count after the update.
      if (parsed.data.role !== "admin" && membership.role === "admin") {
        const admins = await adminCount(tx, ctx.orgId);
        if (admins === 0) throw new Error("You need at least one admin in the workspace");
      }
    });
  } catch (err) {
    return { message: err instanceof Error ? err.message : "Failed to change role" };
  }

  await logEvent(ctx.orgId, "role_changed", {
    actorId: ctx.userId,
    meta: { userId: membership.userId, from: membership.role, to: parsed.data.role },
  });

  revalidatePath("/settings");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Remove a member.
// ---------------------------------------------------------------------------

export async function removeMember(
  _prev: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };
  if (!can(ctx, "manage_team")) return { message: "Only admins can remove members" };

  const membershipId = String(formData.get("membershipId"));
  if (!z.string().uuid().safeParse(membershipId).success) return { message: "Invalid ID" };

  const [membership] = await db
    .select()
    .from(schema.memberships)
    .where(
      and(eq(schema.memberships.id, membershipId), eq(schema.memberships.orgId, ctx.orgId)),
    )
    .limit(1);
  if (!membership) return { message: "Membership not found" };
  if (membership.userId === ctx.userId) return { message: "You can't remove yourself" };

  try {
    await db.transaction(async (tx) => {
      if (membership.role === "admin") {
        const admins = await adminCount(tx, ctx.orgId);
        if (admins <= 1) {
          throw new Error("You need at least one admin in the workspace");
        }
      }

      // Clear lead assignments before removing the membership (prevents orphaned assigneeId).
      await tx
        .update(schema.leads)
        .set({ assigneeId: null, updatedAt: new Date() })
        .where(and(eq(schema.leads.orgId, ctx.orgId), eq(schema.leads.assigneeId, membership.userId)));

      // Also clear reminder assignments.
      await tx
        .update(schema.reminders)
        .set({ assigneeId: null, updatedAt: new Date() })
        .where(and(eq(schema.reminders.orgId, ctx.orgId), eq(schema.reminders.assigneeId, membership.userId)));

      // Delete the user's todos in this org.
      await tx
        .delete(schema.todos)
        .where(and(eq(schema.todos.orgId, ctx.orgId), eq(schema.todos.userId, membership.userId)));

      // Delete the user's notes in this org.
      await tx
        .delete(schema.notes)
        .where(and(eq(schema.notes.orgId, ctx.orgId), eq(schema.notes.userId, membership.userId)));

      await tx.delete(schema.memberships).where(and(eq(schema.memberships.id, membership.id), eq(schema.memberships.orgId, ctx.orgId)));
    });
  } catch (err) {
    return { message: err instanceof Error ? err.message : "Failed to remove member" };
  }

  await logEvent(ctx.orgId, "member_removed", {
    actorId: ctx.userId,
    meta: { userId: membership.userId, role: membership.role },
  });

  revalidatePath("/settings");
  return { ok: true };
}
