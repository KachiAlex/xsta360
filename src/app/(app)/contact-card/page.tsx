import { requireAuth, getOrgPlan, planHasFeature } from "@/lib/dal";
import { UpgradePrompt } from "@/components/app/upgrade-prompt";
import { getMyContactCard } from "@/app/actions/contact-cards";
import { ContactCardManager } from "@/components/contact-card/contact-card-manager";
import { Topbar } from "@/components/app/topbar";

export const dynamic = "force-dynamic";

export default async function ContactCardPage() {
  const ctx = await requireAuth();
  const plan = await getOrgPlan(ctx.orgId);
  if (!planHasFeature(plan, "contact_card")) {
    return <UpgradePrompt feature="contact_card" plan={plan} />;
  }
  const card = await getMyContactCard();

  return (
    <>
      <Topbar>
        <div className="font-semibold text-ink">Contact Card</div>
      </Topbar>
      <main className="content flex-1 px-3 sm:px-6 lg:px-8 py-4 sm:py-7 max-w-[720px] w-full mx-auto">
        <ContactCardManager card={card} />
      </main>
    </>
  );
}
