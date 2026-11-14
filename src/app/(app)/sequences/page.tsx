import { requireAuth, getOrgPlan, planHasFeature, getPlanQuota } from "@/lib/dal";
import { getOrgSendUsage } from "@/lib/usage";
import { UpgradePrompt } from "@/components/app/upgrade-prompt";
import { getOrgSequences, getOrgSequenceEnrollments, getOrgLeadOptions, getOrgCategoryOptions } from "@/lib/sequence-queries";
import { getOrgDocuments } from "@/lib/document-queries";
import { Topbar } from "@/components/app/topbar";
import { Panel, PanelHead } from "@/components/ui/panel";
import { SequenceList } from "@/components/app/sequence-list";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

export default async function SequencesPage() {
  const ctx = await requireAuth();
  const plan = await getOrgPlan(ctx.orgId);
  if (!planHasFeature(plan, "sequences")) {
    return <UpgradePrompt feature="sequences" plan={plan} />;
  }

  const [sequences, documents, orgRow, enrollments, leads, categories, usage] = await Promise.all([
    getOrgSequences(ctx.orgId),
    getOrgDocuments(ctx.orgId),
    db.select({ name: schema.organizations.name }).from(schema.organizations).where(eq(schema.organizations.id, ctx.orgId)).limit(1),
    getOrgSequenceEnrollments(ctx.orgId),
    getOrgLeadOptions(ctx.orgId),
    getOrgCategoryOptions(ctx.orgId),
    getOrgSendUsage(ctx.orgId),
  ]);

  const emailLimit = getPlanQuota(plan, "email_monthly_limit");
  const waLimit = getPlanQuota(plan, "whatsapp_monthly_limit");
  const waDailyLimit = getPlanQuota(plan, "whatsapp_daily_limit");
  const overMonthly =
    (emailLimit != null && usage.emailsThisMonth >= emailLimit) ||
    (waLimit != null && usage.whatsappThisMonth >= waLimit);
  const overDaily = waDailyLimit != null && usage.whatsappToday >= waDailyLimit;

  return (
    <>
      <Topbar>
        <span className="px-4 py-2 text-[13.5px] font-semibold bg-panel text-ink rounded shadow-[0_1px_0_var(--color-rule)]">
          Sequences
        </span>
      </Topbar>

      <div className="content flex-1 px-3 sm:px-6 lg:px-8 py-4 sm:py-7 max-w-[1240px] w-full mx-auto">
        <Panel>
          <PanelHead title="Sales sequences" sub="Automated drip follow-ups — enroll leads and steps fire on a schedule" />
          <div className={`mx-4 sm:mx-5 mt-3 rounded border px-3.5 py-2.5 text-xs ${
            overMonthly || overDaily
              ? "border-stamp/30 bg-stamp/10 text-stamp"
              : "border-rule bg-paper-2 text-ink-soft"
          }`}>
            <span className="font-semibold">Send usage this month:</span>{" "}
            {usage.emailsThisMonth.toLocaleString()}{emailLimit != null ? ` / ${emailLimit.toLocaleString()}` : ""} emails
            {" · "}
            {usage.whatsappThisMonth.toLocaleString()}{waLimit != null ? ` / ${waLimit.toLocaleString()}` : ""} WhatsApp
            {waDailyLimit != null && ` · max ${waDailyLimit} WhatsApp/day`}
            {(overMonthly || overDaily) && (
              <span className="block mt-1">
                {overMonthly
                  ? "Monthly quota reached — due steps are paused and will resume on the 1st of next month or after a plan upgrade."
                  : "Daily WhatsApp cap reached — WhatsApp steps resume tomorrow; email steps are unaffected."}
              </span>
            )}
            <a href="/settings" className="underline underline-offset-2 hover:text-ink">Plan limits</a>
          </div>
          <SequenceList
            sequences={sequences}
            documents={documents.map((d) => ({
              id: d.id,
              fileName: d.fileName,
              sizeBytes: d.sizeBytes,
              mimeType: d.mimeType,
            }))}
            orgName={orgRow[0]?.name ?? "Xsta360"}
            enrollments={enrollments}
            leads={leads}
            categories={categories}
          />
        </Panel>
      </div>
    </>
  );
}
