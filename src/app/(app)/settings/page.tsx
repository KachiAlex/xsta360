import { requireAuth, can, getOrgPlan, getPlanQuota } from "@/lib/dal";
import { getOrgSendUsage } from "@/lib/usage";
import { getOrgStages, getOrgMembers } from "@/lib/queries";
import { db, schema } from "@/db";
import { eq, and, isNull } from "drizzle-orm";
import { Topbar } from "@/components/app/topbar";
import { Panel, PanelHead } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { InviteForm } from "@/components/app/invite-form";
import { StageManager } from "@/components/app/stage-manager";
import { MemberRow } from "@/components/app/member-row";
import { InvitationRow } from "@/components/app/invitation-row";
import { OrgSettingsForm } from "@/components/app/org-settings-form";

const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");

export default async function SettingsPage() {
  const ctx = await requireAuth();
  const isAdmin = can(ctx, "manage_team");

  const [stages, members, invitations, org, plan, usage] = await Promise.all([
    getOrgStages(ctx.orgId),
    getOrgMembers(ctx.orgId),
    isAdmin
      ? db.select().from(schema.invitations).where(
          and(
            eq(schema.invitations.orgId, ctx.orgId),
            isNull(schema.invitations.acceptedAt),
          ),
        )
      : Promise.resolve([]),
    db.select().from(schema.organizations).where(eq(schema.organizations.id, ctx.orgId)).limit(1),
    getOrgPlan(ctx.orgId),
    getOrgSendUsage(ctx.orgId),
  ]);

  const emailLimit = getPlanQuota(plan, "email_monthly_limit");
  const waMonthlyLimit = getPlanQuota(plan, "whatsapp_monthly_limit");
  const waDailyLimit = getPlanQuota(plan, "whatsapp_daily_limit");

  return (
    <>
      <Topbar />
      <div className="content flex-1 px-3 sm:px-6 lg:px-8 py-4 sm:py-7 max-w-[1240px] w-full mx-auto space-y-4 sm:space-y-6">
        <h1 className="font-mono text-xl">Workspace settings</h1>

        {/* Team management */}
        <Panel>
          <PanelHead title="Members" sub={`${members.length} member${members.length === 1 ? "" : "s"}`}>
            {isAdmin && <span className="text-xs text-ink-soft font-mono">Admin only</span>}
          </PanelHead>
          {/* Desktop: table */}
          <table className="w-full border-collapse hidden md:table">
            <thead>
              <tr>
                <th className="text-left font-mono text-[11px] uppercase tracking-wider text-ink-soft px-5 py-3 border-b border-rule font-semibold">Name</th>
                <th className="text-left font-mono text-[11px] uppercase tracking-wider text-ink-soft px-5 py-3 border-b border-rule font-semibold">Email</th>
                <th className="text-left font-mono text-[11px] uppercase tracking-wider text-ink-soft px-5 py-3 border-b border-rule font-semibold">Role</th>
                {isAdmin && <th className="px-5 py-3 border-b border-rule" />}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.membershipId} className="hover:bg-paper-2">
                  <td className="px-5 py-3.5 border-b border-dashed border-rule font-semibold">{m.name}</td>
                  <td className="px-5 py-3.5 border-b border-dashed border-rule text-sm">{m.email}</td>
                  <td className="px-5 py-3.5 border-b border-dashed border-rule">
                    {isAdmin ? (
                      <MemberRow
                        membershipId={m.membershipId}
                        currentRole={m.role}
                        isSelf={m.userId === ctx.userId}
                      />
                    ) : (
                      <Badge tone={m.role === "admin" ? "won" : m.role === "manager" ? "today" : "neutral"}>
                        {m.role}
                      </Badge>
                    )}
                  </td>
                  {isAdmin && <td className="px-5 py-3.5 border-b border-dashed border-rule" />}
                </tr>
              ))}
            </tbody>
          </table>
          {/* Mobile: card list */}
          <div className="md:hidden divide-y divide-dashed divide-rule">
            {members.map((m) => (
              <div key={m.membershipId} className="px-4 py-3.5 active:bg-paper-2/30 transition-colors">
                <div className="font-semibold text-sm">{m.name}</div>
                <div className="text-xs text-ink-soft mb-2.5">{m.email}</div>
                {isAdmin ? (
                  <MemberRow
                    membershipId={m.membershipId}
                    currentRole={m.role}
                    isSelf={m.userId === ctx.userId}
                  />
                ) : (
                  <Badge tone={m.role === "admin" ? "won" : m.role === "manager" ? "today" : "neutral"}>
                    {m.role}
                  </Badge>
                )}
              </div>
            ))}
          </div>
          {isAdmin && (
            <div className="px-5 py-4 border-t border-rule">
              <InviteForm />
            </div>
          )}
          {isAdmin && invitations.length > 0 && (
            <div className="px-5 py-4 border-t border-rule">
              <div className="font-mono text-[11px] uppercase tracking-wider text-ink-soft mb-2">Pending invitations</div>
              <ul className="space-y-2 text-sm">
                {invitations.map((inv) => (
                  <InvitationRow
                    key={inv.id}
                    id={inv.id}
                    email={inv.email}
                    role={inv.role}
                    inviteUrl={`${appUrl}/join/${inv.token}`}
                    expiresAt={inv.expiresAt}
                  />
                ))}
              </ul>
            </div>
          )}
        </Panel>

        {/* Pipeline stages */}
        {can(ctx, "configure") && (
          <Panel>
            <PanelHead title="Pipeline stages" sub="Customize how your team sells — set win probability per stage for forecasting" />
            <StageManager stages={stages} />
          </Panel>
        )}

        {/* Messaging usage — this month's sends against plan allowances */}
        <Panel>
          <PanelHead title="Messaging usage" sub={`${plan.planName} plan · resets on the 1st of each month`} />
          <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <UsageMeter label="Emails this month" used={usage.emailsThisMonth} limit={emailLimit} />
            <UsageMeter label="WhatsApp this month" used={usage.whatsappThisMonth} limit={waMonthlyLimit} />
            <UsageMeter label="WhatsApp today" used={usage.whatsappToday} limit={waDailyLimit} />
          </div>
          <div className="px-5 pb-4 space-y-1.5 text-[11px] text-ink-soft border-t border-dashed border-rule pt-3.5">
            <p><span className="font-semibold text-ink">What counts:</span> every email or WhatsApp message a sequence or reminder actually sends. Failed sends don&apos;t count — only accepted deliveries.</p>
            <p><span className="font-semibold text-ink">Who bills you:</span> WhatsApp messages are billed by <span className="font-semibold">Meta directly to your WABA&apos;s payment method</span> (~5¢ per marketing template message) — that charge is between you and Meta, separate from your Xsta360 subscription. Emails send through our platform at no extra cost to you.</p>
            <p><span className="font-semibold text-ink">When a limit is reached:</span> due sequence steps pause automatically and retry on the next run — nothing is lost or cancelled. Sends resume on the 1st of the month (or tomorrow for the daily cap). You&apos;ll get a notification the first time it happens each period.</p>
            <p><span className="font-semibold text-ink">Why a daily WhatsApp cap:</span> Meta throttles numbers that send high volumes of marketing messages — the cap protects your WABA quality rating. Replies from a lead open a free 24-hour window where messages don&apos;t use the marketing-template rate.</p>
            <p><span className="font-semibold text-ink">Need more?</span> Upgrade your plan or contact support to raise a limit.</p>
          </div>
        </Panel>

        {/* Org settings: WhatsApp, custom fields, currency */}
        {can(ctx, "configure") && org[0] && (
          <Panel>
            <PanelHead title="Organization settings" sub="WhatsApp, custom fields, currency" />
            <OrgSettingsForm
              currency={org[0].currency}
              replyToEmail={org[0].replyToEmail}
              whatsappConfig={org[0].whatsappConfig as any}
              customFieldDefs={org[0].customFieldDefs as any}
              emailDomain={org[0].emailDomain}
              emailDomainStatus={org[0].emailDomainStatus}
              emailDomainRecords={org[0].emailDomainRecords as any}
              emailFromAddress={org[0].emailFromAddress}
              emailDomainEnabled={Boolean(process.env.BREVO_API_KEY)}
              teamReportEmails={org[0].teamReportEmails}
            />
          </Panel>
        )}
      </div>
    </>
  );
}

/** Small "used / limit" meter; null limit renders as unlimited. */
function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const tone = pct >= 100 ? "bg-stamp" : pct >= 80 ? "bg-today" : "bg-[var(--accent)]";
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold">{label}</span>
        <span className="font-mono text-xs text-ink-soft">
          {used.toLocaleString()}{limit == null ? " sent" : ` / ${limit.toLocaleString()}`}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 rounded bg-paper-2 overflow-hidden">
        {limit != null && <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />}
      </div>
    </div>
  );
}
