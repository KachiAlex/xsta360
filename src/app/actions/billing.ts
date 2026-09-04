"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { verifySession } from "@/lib/dal";
import { logEvent } from "@/lib/audit";

export type BillingFormState = {
  message?: string;
  error?: boolean;
};

/**
 * Switch the org's subscription to a different plan.
 * Admin only. Takes effect immediately — the new monthly amount is computed
 * from the new plan; if the org has a saved card, the next recurring charge
 * uses the new price. Seat limits of the new plan are not retroactively
 * enforced (existing members stay), but new invites will be capped.
 */
export async function changePlan(
  _prev: BillingFormState,
  formData: FormData,
): Promise<BillingFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in", error: true };
  if (ctx.role !== "admin") return { message: "Only admins can change the plan", error: true };

  const planId = String(formData.get("planId") ?? "");
  if (!z.string().uuid().safeParse(planId).success) {
    return { message: "Invalid plan", error: true };
  }

  const [plan] = await db
    .select()
    .from(schema.plans)
    .where(and(eq(schema.plans.id, planId), eq(schema.plans.active, true)))
    .limit(1);
  if (!plan) return { message: "Plan not found", error: true };

  const [sub] = await db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.orgId, ctx.orgId))
    .limit(1);

  if (!sub) {
    return { message: "No subscription found", error: true };
  }
  if (sub.planId === planId) {
    return { message: `Already on the ${plan.name} plan` };
  }

  await db
    .update(schema.subscriptions)
    .set({ planId, updatedAt: new Date() })
    .where(eq(schema.subscriptions.id, sub.id));

  await logEvent(ctx.orgId, "subscription_updated", {
    actorId: ctx.userId,
    meta: { action: "plan_changed", from: sub.planId, to: planId, planName: plan.name },
  });

  revalidatePath("/billing");
  return { message: `Switched to the ${plan.name} plan` };
}
