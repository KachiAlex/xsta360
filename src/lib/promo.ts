import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export type PromoCode = typeof schema.promoCodes.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type PromoCheck =
  | { ok: true; promo: PromoCode }
  | { ok: false; error: string };

/**
 * Validate a promo code for redemption. Codes are matched case-insensitively.
 */
export async function validatePromoCode(code: string): Promise<PromoCheck> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return { ok: false, error: "Enter a promo code" };

  const [promo] = await db
    .select()
    .from(schema.promoCodes)
    .where(eq(schema.promoCodes.code, normalized))
    .limit(1);

  if (!promo || !promo.active) return { ok: false, error: "Invalid promo code" };
  if (promo.expiresAt && promo.expiresAt < new Date()) {
    return { ok: false, error: "This promo code has expired" };
  }
  if (promo.maxRedemptions !== null && promo.redeemedCount >= promo.maxRedemptions) {
    return { ok: false, error: "This promo code has been fully redeemed" };
  }
  return { ok: true, promo };
}

/**
 * Apply a promo to an org inside a transaction: records the redemption
 * (one per org per code), moves the org's subscription to the promo plan
 * as a fresh trial of `freeDays`, and bumps the redemption counter.
 */
export async function applyPromoToOrg(
  tx: Tx,
  orgId: string,
  promo: PromoCode,
): Promise<{ ok: boolean; error?: string }> {
  const redemption = await tx
    .insert(schema.promoRedemptions)
    .values({ promoCodeId: promo.id, orgId })
    .onConflictDoNothing()
    .returning({ id: schema.promoRedemptions.id });
  if (redemption.length === 0) {
    return { ok: false, error: "This workspace already redeemed that code" };
  }

  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + promo.freeDays * 24 * 60 * 60 * 1000);

  const [existing] = await tx
    .select({ id: schema.subscriptions.id })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.orgId, orgId))
    .limit(1);

  if (existing) {
    // Promo replaces whatever state the sub was in — fresh free period.
    await tx
      .update(schema.subscriptions)
      .set({
        planId: promo.planId,
        status: "trialing",
        trialEndsAt,
        graceEndsAt: null,
        canceledAt: null,
        currentPeriodStart: now,
        currentPeriodEnd: trialEndsAt,
        updatedAt: now,
      })
      .where(eq(schema.subscriptions.id, existing.id));
  } else {
    await tx.insert(schema.subscriptions).values({
      orgId,
      planId: promo.planId,
      status: "trialing",
      trialEndsAt,
      currentPeriodStart: now,
      currentPeriodEnd: trialEndsAt,
    });
  }

  await tx
    .update(schema.promoCodes)
    .set({ redeemedCount: sql`${schema.promoCodes.redeemedCount} + 1` })
    .where(eq(schema.promoCodes.id, promo.id));

  return { ok: true };
}
