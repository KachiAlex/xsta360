import Link from "next/link";
import type { OrgPlan } from "@/lib/dal";

const FEATURE_LABELS: Record<string, string> = {
  reports: "Reports & analytics",
  sequences: "Sequences",
  api_access: "API access",
};

export function UpgradePrompt({ feature, plan }: { feature: string; plan: OrgPlan }) {
  const label = FEATURE_LABELS[feature] ?? feature;
  return (
    <div className="content flex-1 px-3 sm:px-6 lg:px-8 py-4 sm:py-7 max-w-[720px] w-full mx-auto">
      <div className="bg-panel border border-rule rounded-md p-8 text-center space-y-4">
        <div className="font-mono text-lg text-ink-soft">— locked —</div>
        <h1 className="font-mono text-xl m-0">{label} is not on your plan</h1>
        <p className="text-sm text-ink-soft m-0">
          You&rsquo;re on the <span className="font-semibold text-ink">{plan.planName}</span> plan.
          Upgrade to unlock {label.toLowerCase()} and more.
        </p>
        <div>
          <Link
            href="/billing"
            className="inline-block bg-ink text-paper text-sm font-semibold px-5 py-2.5 rounded hover:opacity-90"
          >
            View plans & upgrade
          </Link>
        </div>
      </div>
    </div>
  );
}
