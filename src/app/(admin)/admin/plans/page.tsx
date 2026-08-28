import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { PlanForm } from "@/components/admin/plan-form";
import { DeletePlanButton } from "@/components/admin/delete-plan-button";

export default async function AdminPlansPage() {
  const plans = await db
    .select()
    .from(schema.plans)
    .orderBy(schema.plans.position);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-mono text-xl sm:text-2xl m-0 mb-1">Plans</h1>
        <p className="text-sm text-ink-soft m-0">Define subscription tiers and their limits.</p>
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
          plans.map((plan) => (
            <div key={plan.id} className="bg-panel border border-rule rounded-md">
              <div className="px-4 py-3 border-b border-rule flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="font-mono text-sm uppercase tracking-wider m-0">{plan.name}</h3>
                  {!plan.active && (
                    <span className="text-[10px] font-semibold text-stamp bg-stamp/10 px-1.5 py-0.5 rounded">
                      Inactive
                    </span>
                  )}
                </div>
                <DeletePlanButton planId={plan.id} planName={plan.name} />
              </div>
              <div className="p-4">
                <PlanForm
                  mode="edit"
                  plan={{
                    id: plan.id,
                    name: plan.name,
                    priceMonthly: plan.priceMonthly,
                    priceYearly: plan.priceYearly,
                    maxUsers: plan.maxUsers,
                    maxLeads: plan.maxLeads,
                    features: JSON.stringify(plan.features, null, 2),
                    position: plan.position,
                  }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
