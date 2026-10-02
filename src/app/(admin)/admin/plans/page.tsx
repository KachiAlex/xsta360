import { db, schema } from "@/db";
import { count } from "drizzle-orm";
import { PlanForm } from "@/components/admin/plan-form";
import { PlanManager } from "@/components/admin/plan-manager";

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
    </div>
  );
}
