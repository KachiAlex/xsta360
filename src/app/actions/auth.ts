"use server";

import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq, isNull, sql, and } from "drizzle-orm";
import { db, schema } from "@/db";
import { createSession, deleteSession } from "@/lib/session";
import { logEvent } from "@/lib/audit";
import { nanoid } from "nanoid";
import { headers } from "next/headers";
import { rateLimit } from "@/lib/rate-limit";

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
  next: z.string().nullish(),
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

const RequestResetSchema = z.object({
  email: z.email("Please enter a valid email").trim().toLowerCase(),
});

const ResetPasswordSchema = z.object({
  token: z.string().min(10, "Invalid reset link"),
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
  // Rate limit: 5 signups per IP per hour.
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimit(`signup:${ip}`, 5, 60 * 60 * 1000);
  if (!rl.allowed) {
    return { errors: { _: ["Too many signup attempts. Try again later."] } };
  }

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
      // Workspace creator = workspace admin.
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
      // Auto-assign the first active plan as a trialing subscription (free trial).
      const [defaultPlan] = await tx
        .select({ id: schema.plans.id, trialDays: schema.plans.trialDays })
        .from(schema.plans)
        .where(eq(schema.plans.active, true))
        .orderBy(schema.plans.position)
        .limit(1);
      if (defaultPlan) {
        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + defaultPlan.trialDays);
        await tx.insert(schema.subscriptions).values({
          orgId: org.id,
          planId: defaultPlan.id,
          status: "trialing",
          trialEndsAt,
          currentPeriodStart: new Date(),
          currentPeriodEnd: trialEndsAt,
        });
      }
      return [{ org, user }] as const;
    });

    await createSession({
      userId: created.user.id,
      orgId: created.org.id,
      role: "admin",
      isSuperadmin: false,
      tokenVersion: 0,
    });
    redirect("/dashboard");
  } catch (err) {
    // redirect() throws a special error — re-throw it so Next.js handles it.
    if (isRedirectError(err)) throw err;
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
        .where(
          and(
            eq(schema.invitations.id, invite.id),
            isNull(schema.invitations.acceptedAt),
          ),
        );
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
      isSuperadmin: false,
      tokenVersion: 0,
    });
    redirect("/dashboard");
  } catch (err) {
    if (isRedirectError(err)) throw err;
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
  // Rate limit: 10 login attempts per IP per 15 minutes.
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimit(`signin:${ip}`, 10, 15 * 60 * 1000);
  if (!rl.allowed) {
    return { message: "Too many login attempts. Try again in a few minutes." };
  }

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

    // Suspended users cannot sign in.
    if (user.suspendedAt) {
      return { message: "Your account has been suspended. Contact support." };
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return { message: "Invalid email or password" };
    }

    // Superadmins go straight to the admin panel — they don't need an org membership.
    if (user.isSuperadmin) {
      await createSession({
        userId: user.id,
        orgId: "00000000-0000-0000-0000-000000000000", // placeholder — superadmin has no org
        role: "admin",
        isSuperadmin: true,
        tokenVersion: user.tokenVersion,
      });
      const redirectTo = next && isInternalPath(next) ? next : "/admin";
      redirect(redirectTo);
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

    await createSession({
      userId: user.id,
      orgId: membership.orgId,
      role: membership.role,
      isSuperadmin: false,
      tokenVersion: user.tokenVersion,
    });
    const redirectTo = next && isInternalPath(next) ? next : "/dashboard";
    redirect(redirectTo);
  } catch (err) {
    if (isRedirectError(err)) throw err;
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

// ---------------------------------------------------------------------------
// Request password reset
// ---------------------------------------------------------------------------

export async function requestPasswordReset(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  // Rate limit: 5 reset requests per IP per hour.
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimit(`reset:${ip}`, 5, 60 * 60 * 1000);
  if (!rl.allowed) {
    return { message: "Too many reset requests. Try again later." };
  }

  const parsed = RequestResetSchema.safeParse({
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return { errors: parseErrors(parsed.error) };
  }

  const { email } = parsed.data;

  try {
    const [user] = await db
      .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    if (user) {
      const token = nanoid(32);
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);

      await db.insert(schema.passwordResetTokens).values({
        email: user.email,
        token,
        expiresAt,
      });

      const { sendPasswordResetEmail } = await import("@/lib/email");
      const appUrl = process.env.APP_URL ?? "https://xsta360.com.ng";
      await sendPasswordResetEmail({
        to: user.email,
        resetUrl: `${appUrl}/reset/${token}`,
      }).catch((e) => console.error("Password reset email failed:", e));
    }

    // Always return the same message to avoid email enumeration.
    return { message: "If this email exists, a reset link has been sent." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong";
    return { message: `Reset request failed: ${message}` };
  }
}

// ---------------------------------------------------------------------------
// Reset password with token
// ---------------------------------------------------------------------------

export async function resetPassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = ResetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { errors: parseErrors(parsed.error) };
  }

  const { token, password } = parsed.data;

  try {
    const [record] = await db
      .select()
      .from(schema.passwordResetTokens)
      .where(eq(schema.passwordResetTokens.token, token))
      .limit(1);

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      return { message: "This reset link is invalid or has expired." };
    }

    const [user] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, record.email))
      .limit(1);

    if (!user) {
      return { message: "This reset link is invalid or has expired." };
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await db.transaction(async (tx) => {
      await tx
        .update(schema.users)
        .set({ passwordHash, tokenVersion: sql`${schema.users.tokenVersion} + 1`, updatedAt: new Date() })
        .where(eq(schema.users.id, user.id));
      await tx
        .update(schema.passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(schema.passwordResetTokens.id, record.id),
            isNull(schema.passwordResetTokens.usedAt),
          ),
        );
    });

    redirect("/login?reset=1");
  } catch (err) {
    if (isRedirectError(err)) throw err;
    const message = err instanceof Error ? err.message : "Something went wrong";
    return { message: `Password reset failed: ${message}` };
  }
}
