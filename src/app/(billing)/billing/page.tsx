import { requireAuth, getOrgBilling, getPlanMaxMembers } from "@/lib/dal";
import { db, schema } from "@/db";
import { eq, asc } from "drizzle-orm";
import type { Metadata } from "next";
import { PaystackCheckout } from "@/components/app/paystack-checkout";
import { PlanPicker, type PlanOption } from "@/components/app/plan-picker";
import { Price } from "@/components/app/price";
import { normalizeCurrency } from "@/lib/currency";

export const metadata: Metadata = {
  title: "Billing & plans",
  description: "Manage your Xsta360 subscription, payment method, and plan.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/billing" },
};

const FEATURE_LABELS: Record<string, string> = {
  leads: "Lead management",
  contact_card: "Digital contact card",
  custom_fields: "Custom fields",
  follow_ups: "Follow-up reminders",
  pipeline: "Pipeline board",
  tasks: "To-dos & notes",
  reports: "Reports & analytics",
  sequences: "Sequences",
  api_access: "API access",
  sso: "SSO",
  dedicated_support: "Dedicated support",
};
const FEATURE_ORDER = [
  "leads",
  "contact_card",
  "custom_fields",
  "follow_ups",
  "pipeline",
  "tasks",
  "reports",
  "sequences",
  "api_access",
  "sso",
  "dedicated_support",
];

export default async function BillingPage() {
  const ctx = await requireAuth();
  const billing = await getOrgBilling(ctx.orgId);

  // Get members for breakdown.
  const members = await db
    .select({
      name: schema.users.name,
      email: schema.users.email,
      role: schema.memberships.role,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(eq(schema.memberships.orgId, ctx.orgId))
    .orderBy(schema.memberships.createdAt);

  const [sub] = await db
    .select({
      status: schema.subscriptions.status,
      trialEndsAt: schema.subscriptions.trialEndsAt,
      currentPeriodEnd: schema.subscriptions.currentPeriodEnd,
      lastPaymentAt: schema.subscriptions.lastPaymentAt,
      paystackAuthorizationCode: schema.subscriptions.paystackAuthorizationCode,
      graceEndsAt: schema.subscriptions.graceEndsAt,
    })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.orgId, ctx.orgId))
    .limit(1);

  // All active plans for the picker.
  const allPlans = await db
    .select()
    .from(schema.plans)
    .where(eq(schema.plans.active, true))
    .orderBy(asc(schema.plans.position));

  const planOptions: PlanOption[] = allPlans.map((p) => {
    const feats = (p.features ?? {}) as Record<string, unknown>;
    // Base features included on every plan (core CRM functionality).
    const BASE_FEATURES = ["leads", "follow_ups", "pipeline", "tasks"];
    return {
      id: p.id,
      name: p.name,
      basePriceMonthly: p.basePriceMonthly,
      perSeatPriceMonthly: p.perSeatPriceMonthly,
      currency: normalizeCurrency(p.currency),
      maxMembers: typeof feats.max_members === "number" ? feats.max_members : null,
      features: FEATURE_ORDER.map((key) => ({
        key,
        label: FEATURE_LABELS[key],
        included: feats[key] === true || BASE_FEATURES.includes(key),
      })),
    };
  });

  const isAdmin = ctx.role === "admin";
  const hasPaymentMethod = !!sub?.paystackAuthorizationCode;
  const isTrial = billing.plan.status === "trialing";
  const isActive = billing.plan.status === "active";
  const isPastDue = billing.plan.status === "past_due";

  return (
    <div className="content flex-1 px-3 sm:px-6 lg:px-8 py-4 sm:py-7 max-w-[1240px] w-full mx-auto space-y-6">
      <div>
        <h1 className="font-mono text-xl sm:text-2xl m-0 mb-1">Billing & Subscription</h1>
        <p className="text-sm text-ink-soft m-0">Manage your workspace plan and payment method.</p>
      </div>

      {/* Status banner */}
      {isTrial && (
        <div className="bg-amber/10 border border-amber/20 rounded-md px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-amber text-lg">⚠</span>
            <div>
              <div className="font-semibold text-sm text-[#9c6014]">
                {billing.daysLeftInTrial !== null && billing.daysLeftInTrial > 0
                  ? `Free trial — ${billing.daysLeftInTrial} day${billing.daysLeftInTrial !== 1 ? "s" : ""} left`
                  : "Trial expired"}
              </div>
              <div className="text-xs text-[#9c6014] mt-0.5">
                {billing.trialEndsAt && `Ends ${billing.trialEndsAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`}
                {" — add a payment method to continue after the trial."}
              </div>
            </div>
          </div>
        </div>
      )}

      {isActive && (
        <div className="bg-register/10 border border-register/20 rounded-md px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-register text-lg">✓</span>
            <div>
              <div className="font-semibold text-sm text-register">Subscription active</div>
              <div className="text-xs text-register mt-0.5">
                {sub?.currentPeriodEnd && `Next billing: ${sub.currentPeriodEnd.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`}
              </div>
            </div>
          </div>
        </div>
      )}

      {isPastDue && (
        <div className="bg-stamp/10 border border-stamp/20 rounded-md px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-stamp text-lg">✕</span>
            <div>
              <div className="font-semibold text-sm text-stamp">Payment overdue</div>
              <div className="text-xs text-stamp mt-0.5">
                {sub?.graceEndsAt && sub.graceEndsAt > new Date()
                  ? `Your last payment failed. Access continues until ${sub.graceEndsAt.toLocaleDateString("en-US", { month: "long", day: "numeric" })} — please update your payment method.`
                  : "Your last payment failed. Please pay to reactivate your subscription."}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Plan summary */}
      <div className="bg-panel border border-rule rounded-md">
        <div className="px-4 py-3 border-b border-rule">
          <h2 className="font-mono text-sm uppercase tracking-wider m-0">Current plan</h2>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-ink-soft">Plan</span>
            <span className="font-semibold">{billing.plan.planName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-ink-soft">Base price (admin)</span>
            <Price amount={billing.plan.basePriceMonthly} currency={billing.plan.currency} />/mo
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-ink-soft">Per additional member</span>
            <Price amount={billing.plan.perSeatPriceMonthly} currency={billing.plan.currency} />/mo
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-ink-soft">Free trial period</span>
            <span className="font-mono">{billing.plan.trialDays} days</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-ink-soft">Member limit</span>
            <span className="font-mono">
              {(() => {
                const max = getPlanMaxMembers(billing.plan);
                return max === null ? "Unlimited" : `${billing.memberCount} / ${max}`;
              })()}
            </span>
          </div>
        </div>
      </div>

      {/* Plan picker — admins can upgrade/downgrade */}
      {isAdmin && planOptions.length > 1 && (
        <div className="bg-panel border border-rule rounded-md">
          <div className="px-4 py-3 border-b border-rule">
            <h2 className="font-mono text-sm uppercase tracking-wider m-0">Change plan</h2>
          </div>
          <div className="p-4">
            <PlanPicker plans={planOptions} currentPlanId={billing.plan.planId} memberCount={billing.memberCount} hasSavedCard={hasPaymentMethod} />
            <p className="text-xs text-ink-soft mt-3 m-0">
              Plan changes apply to your next charge — your current paid period is unaffected.
            </p>
          </div>
        </div>
      )}

      {/* Billing breakdown */}
      <div className="bg-panel border border-rule rounded-md">
        <div className="px-4 py-3 border-b border-rule">
          <h2 className="font-mono text-sm uppercase tracking-wider m-0">Current bill</h2>
        </div>
        <div className="p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-ink-soft">Workspace admin (you)</span>
            <Price amount={billing.plan.basePriceMonthly} currency={billing.plan.currency} />/mo
          </div>
          {Math.max(0, billing.memberCount - 1) > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-ink-soft">
                Additional members ({Math.max(0, billing.memberCount - 1)} × <Price amount={billing.plan.perSeatPriceMonthly} currency={billing.plan.currency} />)
              </span>
              <span className="font-mono">
                <Price amount={(Math.max(0, billing.memberCount - 1) * billing.plan.perSeatPriceMonthly)} currency={billing.plan.currency} />/mo
              </span>
            </div>
          )}
          <div className="border-t border-rule pt-2 flex justify-between">
            <span className="font-semibold">Total / month</span>
            <span className="font-mono font-bold text-lg text-register">
              <Price amount={billing.monthlyAmount} currency={billing.plan.currency} />
            </span>
          </div>
        </div>
      </div>

      {/* Members breakdown */}
      <div className="bg-panel border border-rule rounded-md">
        <div className="px-4 py-3 border-b border-rule">
          <h2 className="font-mono text-sm uppercase tracking-wider m-0">Members ({members.length})</h2>
        </div>
        <div className="divide-y divide-dashed divide-rule">
          {members.map((m, i) => (
            <div key={i} className="px-4 py-3 flex items-center justify-between">
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">{m.name}</div>
                <div className="text-xs text-ink-soft truncate">{m.email}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                  m.role === "admin" ? "bg-register/12 text-register" : "bg-paper-2 text-ink-soft"
                }`}>
                  {m.role === "admin" ? "Admin" : m.role}
                </span>
                <span className="text-xs font-mono text-ink-soft">
                  <Price amount={m.role === "admin" ? billing.plan.basePriceMonthly : billing.plan.perSeatPriceMonthly} currency={billing.plan.currency} className="text-xs" />/mo
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Payment section */}
      {isAdmin ? (
        <div className="bg-panel border border-rule rounded-md">
          <div className="px-4 py-3 border-b border-rule">
            <h2 className="font-mono text-sm uppercase tracking-wider m-0">
              {hasPaymentMethod ? "Payment method" : "Add payment method"}
            </h2>
          </div>
          <div className="p-4 space-y-4">
            {hasPaymentMethod ? (
              <div className="text-sm text-ink-soft">
                <p className="m-0 mb-2">
                  ✓ You have a saved payment method. We&rsquo;ll automatically charge
                  {" "}<Price amount={billing.monthlyAmount} currency={billing.plan.currency} className="font-semibold text-ink" />
                  {" "}on your next billing date.
                </p>
                {sub?.lastPaymentAt && (
                  <p className="text-xs m-0">
                    Last payment: {sub.lastPaymentAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                )}
              </div>
            ) : (
              <div className="text-sm text-ink-soft">
                <p className="m-0">
                  Add a payment method via Paystack to activate your subscription.
                  You&rsquo;ll be charged{" "}
                  <Price amount={billing.monthlyAmount} currency={billing.plan.currency} className="font-semibold text-ink" />
                  {" "}now, and automatically billed each month.
                </p>
              </div>
            )}

            <PaystackCheckout />

            <div className="text-xs text-ink-soft pt-2 border-t border-rule">
              <p className="m-0">
                🔒 Payments are processed securely by Paystack. We never store your card details.
                You can cancel anytime from this page.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-panel border border-rule rounded-md px-4 py-3">
          <p className="text-sm text-ink-soft m-0">
            Only workspace admins can manage billing. Contact your admin to update payment methods.
          </p>
        </div>
      )}
    </div>
  );
}
