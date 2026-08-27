"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createSession, deleteSession } from "@/lib/session";
import { logEvent } from "@/lib/audit";
import { nanoid } from "nanoid";

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const SignupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").trim(),
  email: z.email("Please enter a valid email").trim().toLowerCase(),
  orgName: z.string().min(2, "Organization name must be at least 2 characters").trim(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[a-zA-Z]/, "Must contain at least one letter")
    .regex(/[0-9]/, "Must contain at least one number"),
});

const SigninSchema = z.object({
  email: z.email("Please enter a valid email").trim().toLowerCase(),
  password: z.string().min(1, "Password is required"),
  next: z.string().optional(),
});

const SignupAndJoinSchema = z.object({
  token: z.string().min(10, "Invalid invitation"),
  name: z.string().min(2, "Name must be at least 2 characters").trim(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[a-zA-Z]/, "Must contain at least one letter")
    .regex(/[0-9]/, "Must contain at least one number"),
});

export type AuthFormState = {
  errors?: Record<string, string[]>;
  message?: string;
};

// ---------------------------------------------------------------------------
// Default pipeline stages + lost reasons seeded on org creation
// ---------------------------------------------------------------------------

const DEFAULT_STAGES: { name: string; kind: "open" | "won" | "lost"; position: number }[] = [
  { name: "New", kind: "open", position: 0 },
  { name: "Contacted", kind: "open", position: 1 },
  { name: "Negotiating", kind: "open", position: 2 },
  { name: "Won", kind: "won", position: 3 },
  { name: "Lost", kind: "lost", position: 4 },
];

const DEFAULT_LOST_REASONS: { label: string; position: number }[] = [
  { label: "Price too high", position: 0 },
  { label: "Went with competitor", position: 1 },
  { label: "No response / ghosted", position: 2 },
  { label: "Not a fit", position: 3 },
  { label: "Budget / timing", position: 4 },
];

function parseErrors(error: z.ZodError<unknown>) {
  return error.issues.reduce<Record<string, string[]>>((acc, i) => {
    const key = i.path[0]?.toString() ?? "_";
    (acc[key] ??= []).push(i.message);
    return acc;
  }, {});
}

function isInternalPath(value?: string): value is string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
}

// ---------------------------------------------------------------------------
// Signup — creates user + org + admin membership + default config in one tx
// ---------------------------------------------------------------------------

export async function signup(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = SignupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    orgName: formData.get("orgName"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { errors: parseErrors(parsed.error) };
  }

  const { name, email, orgName, password } = parsed.data;

  try {
    // Reject if email already in use.
    const [existing] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    if (existing) {
      return { errors: { email: ["An account with this email already exists"] } };
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [created] = await db.transaction(async (tx) => {
      const [org] = await tx
        .insert(schema.organizations)
        .values({ name: orgName, formToken: nanoid(24) })
        .returning();
      const [user] = await tx
        .insert(schema.users)
        .values({ name, email, passwordHash })
        .returning();
      await tx.insert(schema.memberships).values({
        orgId: org.id,
        userId: user.id,
        role: "admin",
      });
      await tx.insert(schema.pipelineStages).values(
        DEFAULT_STAGES.map((s) => ({ ...s, orgId: org.id })),
      );
      await tx.insert(schema.lostReasons).values(
        DEFAULT_LOST_REASONS.map((r) => ({ ...r, orgId: org.id, isDefault: r.position === 0 })),
      );
      return [{ org, user }] as const;
    });

    await createSession({ userId: created.user.id, orgId: created.org.id, role: "admin" });
    redirect("/dashboard");
  } catch (err) {
    // redirect() throws a special error — re-throw it so Next.js handles it.
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    const message = err instanceof Error ? err.message : "Something went wrong";
    return { message: `Signup failed: ${message}` };
  }
}

// ---------------------------------------------------------------------------
// Signup through an invite link — creates user + joins workspace, no new org.
// ---------------------------------------------------------------------------

export async function signupAndJoin(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = SignupAndJoinSchema.safeParse({
    token: formData.get("token"),
    name: formData.get("name"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { errors: parseErrors(parsed.error) };
  }

  const { token, name, password } = parsed.data;

  try {
    const [invite] = await db
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.token, token))
      .limit(1);

    if (!invite) return { message: "Invitation not found" };
    if (invite.acceptedAt) return { message: "Invitation already used" };
    if (invite.expiresAt < new Date()) return { message: "Invitation has expired" };

    const [existingUser] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, invite.email))
      .limit(1);

    if (existingUser) {
      return { message: "An account with this email already exists. Sign in to accept the invite." };
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [created] = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(schema.users)
        .values({ name, email: invite.email, passwordHash })
        .returning();
      await tx.insert(schema.memberships).values({
        orgId: invite.orgId,
        userId: user.id,
        role: invite.role,
      });
      await tx
        .update(schema.invitations)
        .set({ acceptedAt: new Date() })
        .where(eq(schema.invitations.id, invite.id));
      return [{ user, orgId: invite.orgId, role: invite.role }] as const;
    });

    await logEvent(created.orgId, "member_joined", {
      actorId: created.user.id,
      meta: { role: created.role, via: "invite" },
    });

    await createSession({
      userId: created.user.id,
      orgId: created.orgId,
      role: created.role,
    });
    redirect("/dashboard");
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    const message = err instanceof Error ? err.message : "Something went wrong";
    return { message: `Join failed: ${message}` };
  }
}

// ---------------------------------------------------------------------------
// Signin — verifies credentials, loads first membership, creates session
// ---------------------------------------------------------------------------

export async function signin(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = SigninSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next"),
  });
  if (!parsed.success) {
    return { errors: parseErrors(parsed.error) };
  }

  const { email, password, next } = parsed.data;

  try {
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    if (!user) {
      return { message: "Invalid email or password" };
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return { message: "Invalid email or password" };
    }

    // Load the user's first org membership to seed the session.
    const [membership] = await db
      .select()
      .from(schema.memberships)
      .where(eq(schema.memberships.userId, user.id))
      .limit(1);

    if (!membership) {
      return { message: "Your account is not part of any workspace yet." };
    }

    await createSession({ userId: user.id, orgId: membership.orgId, role: membership.role });
    const redirectTo = next && isInternalPath(next) ? next : "/dashboard";
    redirect(redirectTo);
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    const message = err instanceof Error ? err.message : "Something went wrong";
    return { message: `Sign in failed: ${message}` };
  }
}

// ---------------------------------------------------------------------------
// Signout
// ---------------------------------------------------------------------------

export async function signout() {
  await deleteSession();
  redirect("/login");
}
