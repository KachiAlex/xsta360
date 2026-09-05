import { requireAuth, can } from "@/lib/dal";
import { getOrgStages, getOrgMembers } from "@/lib/queries";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
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

  const [stages, members, invitations, org] = await Promise.all([
    getOrgStages(ctx.orgId),
    getOrgMembers(ctx.orgId),
    isAdmin
      ? db.select().from(schema.invitations).where(eq(schema.invitations.orgId, ctx.orgId))
      : Promise.resolve([]),
    db.select().from(schema.organizations).where(eq(schema.organizations.id, ctx.orgId)).limit(1),
  ]);

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

        {/* Org settings: WhatsApp, custom fields, currency */}
        {can(ctx, "configure") && org[0] && (
          <Panel>
            <PanelHead title="Organization settings" sub="WhatsApp, custom fields, currency" />
            <OrgSettingsForm
              currency={org[0].currency}
              replyToEmail={org[0].replyToEmail}
              whatsappConfig={org[0].whatsappConfig as any}
              customFieldDefs={org[0].customFieldDefs as any}
            />
          </Panel>
        )}
      </div>
    </>
  );
}
