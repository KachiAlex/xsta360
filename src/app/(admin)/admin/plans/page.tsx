import { db, schema } from "@/db";
import { count, desc, eq } from "drizzle-orm";
import { PlanForm } from "@/components/admin/plan-form";
import { PlanManager } from "@/components/admin/plan-manager";
import { PromoCodeManager } from "@/components/admin/promo-code-manager";

export default async function AdminPlansPage() {
  const plans = await db
    .select()
    .from(schema.plans)
    .orderBy(schema.plans.position);

  // Get subscriber count per plan
  const subCounts = await db
    .select({
      planId: schema.subscriptions.planId,
      count: count(),
    })
    .from(schema.subscriptions)
    .groupBy(schema.subscriptions.planId);
  const subCountMap = new Map(subCounts.map((s) => [s.planId, s.count]));

  const planRows = plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    billingInterval: plan.billingInterval,
    basePriceMonthly: plan.basePriceMonthly,
    perSeatPriceMonthly: plan.perSeatPriceMonthly,
    trialDays: plan.trialDays,
    currency: plan.currency,
    features: JSON.stringify(plan.features, null, 2),
    position: plan.position,
    active: plan.active,
    subscriberCount: subCountMap.get(plan.id) ?? 0,
  }));

  // Promo codes — code → free days on a plan.
  const promos = await db
    .select({
      id: schema.promoCodes.id,
      code: schema.promoCodes.code,
      planName: schema.plans.name,
      freeDays: schema.promoCodes.freeDays,
      maxRedemptions: schema.promoCodes.maxRedemptions,
      redeemedCount: schema.promoCodes.redeemedCount,
      expiresAt: schema.promoCodes.expiresAt,
      active: schema.promoCodes.active,
    })
    .from(schema.promoCodes)
    .innerJoin(schema.plans, eq(schema.promoCodes.planId, schema.plans.id))
    .orderBy(desc(schema.promoCodes.createdAt));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-mono text-xl sm:text-2xl m-0 mb-1">Plans</h1>
        <p className="text-sm text-ink-soft m-0">
          Monthly plans bill base + per-seat every month. Lifetime plans charge a single fixed amount — pay once, no renewals.
        </p>
      </div>

      {/* Create new plan */}
      <div className="bg-panel border border-rule rounded-md">
        <div className="px-4 py-3 border-b border-rule">
          <h2 className="font-mono text-sm uppercase tracking-wider m-0">Create plan</h2>
        </div>
        <div className="p-4">
          <PlanForm mode="create" />
        </div>
      </div>

      {/* Existing plans — pick one to edit */}
      {planRows.length === 0 ? (
        <div className="bg-panel border border-rule rounded-md px-4 py-8 text-center text-sm text-ink-soft">
          No plans yet. Create one above.
        </div>
      ) : (
        <PlanManager plans={planRows} />
      )}

      {/* Promo codes */}
      <div>
        <h2 className="font-mono text-base m-0 mb-1">Promo codes</h2>
        <p className="text-sm text-ink-soft m-0 mb-3">
          Give selected people a free period on a plan — share the code or a /signup?promo=CODE link.
        </p>
        <PromoCodeManager
          promos={promos.map((p) => ({ ...p, expiresAt: p.expiresAt?.toISOString() ?? null }))}
          plans={plans.map((p) => ({ id: p.id, name: p.name }))}
        />
      </div>
    </div>
  );
}
