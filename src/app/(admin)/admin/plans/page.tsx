import { db, schema } from "@/db";
import { eq, count } from "drizzle-orm";
import { PlanForm } from "@/components/admin/plan-form";
import { DeletePlanButton } from "@/components/admin/delete-plan-button";

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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-mono text-xl sm:text-2xl m-0 mb-1">Plans</h1>
        <p className="text-sm text-ink-soft m-0">
          Hybrid per-seat pricing: base fee for the workspace admin + per-seat fee for each additional member.
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

      {/* Existing plans */}
      <div className="space-y-3">
        {plans.length === 0 ? (
          <div className="bg-panel border border-rule rounded-md px-4 py-8 text-center text-sm text-ink-soft">
            No plans yet. Create one above.
          </div>
        ) : (
          plans.map((plan) => {
            const subCount = subCountMap.get(plan.id) ?? 0;
            return (
              <div key={plan.id} className="bg-panel border border-rule rounded-md">
                <div className="px-4 py-3 border-b border-rule flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <h3 className="font-mono text-sm uppercase tracking-wider m-0">{plan.name}</h3>
                    {!plan.active && (
                      <span className="text-[10px] font-semibold text-stamp bg-stamp/10 px-1.5 py-0.5 rounded">
                        Inactive
                      </span>
                    )}
                    <span className="text-[10px] font-mono text-ink-soft">
                      {subCount} subscriber{subCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <DeletePlanButton planId={plan.id} planName={plan.name} />
                </div>

                {/* Pricing summary */}
                <div className="px-4 py-3 bg-paper-2/50 border-b border-rule">
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-ink-soft block">Base (admin)</span>
                      <span className="font-mono font-bold text-base">{plan.currency}{plan.basePriceMonthly.toLocaleString()}<span className="text-xs text-ink-soft font-normal">/mo</span></span>
                    </div>
                    <div>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-ink-soft block">Per seat</span>
                      <span className="font-mono font-bold text-base">{plan.currency}{plan.perSeatPriceMonthly.toLocaleString()}<span className="text-xs text-ink-soft font-normal">/mo</span></span>
                    </div>
                    <div>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-ink-soft block">Free trial</span>
                      <span className="font-mono font-bold text-base">{plan.trialDays}<span className="text-xs text-ink-soft font-normal"> days</span></span>
                    </div>
                  </div>
                  <div className="text-xs text-ink-soft mt-2 font-mono">
                    Example: 5 members = {plan.currency}{(plan.basePriceMonthly + 4 * plan.perSeatPriceMonthly).toLocaleString()}/mo
                  </div>
                </div>

                <div className="p-4">
                  <PlanForm
                    mode="edit"
                    plan={{
                      id: plan.id,
                      name: plan.name,
                      basePriceMonthly: plan.basePriceMonthly,
                      perSeatPriceMonthly: plan.perSeatPriceMonthly,
                      trialDays: plan.trialDays,
                      currency: plan.currency,
                      features: JSON.stringify(plan.features, null, 2),
                      position: plan.position,
                    }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
