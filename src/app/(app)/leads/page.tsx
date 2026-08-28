import Link from "next/link";
import { requireAuth } from "@/lib/dal";
import { getOrgStages, getOrgMembers } from "@/lib/queries";
import { getLeads } from "@/lib/leads";
import { Topbar } from "@/components/app/topbar";
import { AddLeadModal } from "@/components/app/add-lead-modal";
import { MobileFab } from "@/components/app/fab";
import { Panel, PanelHead } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/app/empty-state";

const SOURCE_LABELS: Record<string, string> = {
  referral: "Referral",
  social: "Social",
  ad: "Ad campaign",
  walk_in: "Walk-in",
  embedded_form: "Website form",
  other: "Other",
};

const SOURCES = Object.entries(SOURCE_LABELS);

export default async function LeadsPage(props: {
  searchParams: Promise<{ q?: string; stageId?: string; source?: string; assigneeId?: string }>;
}) {
  const ctx = await requireAuth();
  const filters = await props.searchParams;
  const [stages, members, leads] = await Promise.all([
    getOrgStages(ctx.orgId),
    getOrgMembers(ctx.orgId),
    getLeads(ctx.orgId, filters),
  ]);

  return (
    <>
      <Topbar
        actions={
          <div className="flex gap-2 items-center">
            <Link href="/leads/import" className="text-sm font-semibold border border-ink rounded px-3 py-2 hover:bg-paper-2">
              Import CSV
            </Link>
            <AddLeadModal stages={stages} members={members} currentUserId={ctx.userId} />
          </div>
        }
      />

      <div className="content flex-1 px-3 sm:px-6 lg:px-8 py-4 sm:py-7 max-w-[1240px] w-full mx-auto">
        <MobileFab>
          <AddLeadModal stages={stages} members={members} currentUserId={ctx.userId} />
        </MobileFab>

        {/* Mobile: Import CSV link */}
        <Link href="/leads/import" className="sm:hidden text-xs font-semibold text-ink-soft hover:text-ink mb-3 inline-flex items-center min-h-[36px] active:text-ink">
          📥 Import CSV
        </Link>

        {/* Filter bar */}
        <div className="mb-5">
          <form method="get" className="flex flex-col sm:flex-row gap-2 sm:flex-wrap">
            <select name="stageId" defaultValue={filters.stageId ?? ""} className="text-sm border border-rule bg-panel rounded px-3 py-2.5 flex-1 min-w-0 sm:min-w-[120px] min-h-[44px]">
              <option value="">All stages</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select name="source" defaultValue={filters.source ?? ""} className="text-sm border border-rule bg-panel rounded px-3 py-2.5 flex-1 min-w-0 sm:min-w-[120px] min-h-[44px]">
              <option value="">All sources</option>
              {SOURCES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <select name="assigneeId" defaultValue={filters.assigneeId ?? ""} className="text-sm border border-rule bg-panel rounded px-3 py-2.5 flex-1 min-w-0 sm:min-w-[120px] min-h-[44px]">
              <option value="">Anyone</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>{m.name}</option>
              ))}
            </select>
            <input type="hidden" name="q" value={filters.q ?? ""} />
            <button type="submit" className="text-sm font-semibold border border-ink rounded px-4 py-2.5 hover:bg-paper-2 min-h-[44px] active:bg-paper-2">
              Apply
            </button>
            {(filters.stageId || filters.source || filters.assigneeId) && (
              <Link href="/leads" className="text-sm text-ink-soft underline underline-offset-2 self-center min-h-[44px] flex items-center justify-center px-2">
                Clear
              </Link>
            )}
          </form>
        </div>

        {leads.length === 0 ? (
          <EmptyState
            title={filters.q || filters.stageId || filters.source ? "No leads match your filters" : "No leads yet"}
            description={
              filters.q || filters.stageId || filters.source
                ? "Try adjusting your search or filters."
                : "Add your first lead to start tracking follow-ups and pipeline."
            }
            action={<AddLeadModal stages={stages} members={members} currentUserId={ctx.userId} />}
          />
        ) : (
          <Panel>
            <PanelHead title="Leads" sub={`${leads.length} total`} />
            {/* Desktop: table */}
            <table className="w-full border-collapse hidden md:table">
              <thead>
                <tr>
                  <th className="text-left font-mono text-[11px] uppercase tracking-wider text-ink-soft px-5 py-3 border-b border-rule font-semibold">Lead</th>
                  <th className="text-left font-mono text-[11px] uppercase tracking-wider text-ink-soft px-5 py-3 border-b border-rule font-semibold">Stage</th>
                  <th className="text-left font-mono text-[11px] uppercase tracking-wider text-ink-soft px-5 py-3 border-b border-rule font-semibold">Source</th>
                  <th className="text-right font-mono text-[11px] uppercase tracking-wider text-ink-soft px-5 py-3 border-b border-rule font-semibold">Value</th>
                  <th className="text-right font-mono text-[11px] uppercase tracking-wider text-ink-soft px-5 py-3 border-b border-rule font-semibold">Score</th>
                  <th className="text-left font-mono text-[11px] uppercase tracking-wider text-ink-soft px-5 py-3 border-b border-rule font-semibold">Assignee</th>
                  <th className="text-left font-mono text-[11px] uppercase tracking-wider text-ink-soft px-5 py-3 border-b border-rule font-semibold">Updated</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-paper-2">
                    <td className="px-5 py-3.5 border-b border-dashed border-rule">
                      <Link href={`/leads/${lead.id}`} className="font-semibold hover:underline">
                        {lead.name}
                      </Link>
                      {lead.company && (
                        <div className="text-xs text-ink-soft">{lead.company}</div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 border-b border-dashed border-rule">
                      {lead.stageKind === "won" ? (
                        <Badge tone="won">{lead.stageName ?? "Won"}</Badge>
                      ) : lead.stageKind === "lost" ? (
                        <Badge tone="lost">{lead.stageName ?? "Lost"}</Badge>
                      ) : (
                        <Badge tone="neutral">{lead.stageName ?? "—"}</Badge>
                      )}
                    </td>
                    <td className="px-5 py-3.5 border-b border-dashed border-rule text-sm">
                      {SOURCE_LABELS[lead.source] ?? lead.source}
                      {lead.campaign && <div className="text-xs text-ink-soft">{lead.campaign}</div>}
                    </td>
                    <td className="px-5 py-3.5 border-b border-dashed border-rule text-sm font-mono text-right">
                      {lead.value ? `₦${parseFloat(lead.value).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
                    </td>
                    <td className="px-5 py-3.5 border-b border-dashed border-rule text-right">
                      {lead.score > 0 ? (
                        <span className={`font-mono text-xs font-bold px-1.5 py-0.5 rounded ${
                          lead.score >= 70 ? "bg-register/12 text-register"
                          : lead.score >= 40 ? "bg-amber/14 text-[#9c6014]"
                          : "bg-paper-2 text-ink-soft"
                        }`}>
                          {lead.score}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-5 py-3.5 border-b border-dashed border-rule text-sm">
                      {lead.assigneeName ?? <span className="text-ink-soft">Unassigned</span>}
                    </td>
                    <td className="px-5 py-3.5 border-b border-dashed border-rule text-sm text-ink-soft">
                      {lead.updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Mobile: card list */}
            <div className="md:hidden divide-y divide-dashed divide-rule">
              {leads.map((lead) => (
                <Link key={lead.id} href={`/leads/${lead.id}`} className="block px-4 py-3 active:bg-paper-2/50 transition-colors">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{lead.name}</div>
                      {lead.company && <div className="text-xs text-ink-soft truncate">{lead.company}</div>}
                    </div>
                    {lead.stageKind === "won" ? (
                      <Badge tone="won">{lead.stageName ?? "Won"}</Badge>
                    ) : lead.stageKind === "lost" ? (
                      <Badge tone="lost">{lead.stageName ?? "Lost"}</Badge>
                    ) : (
                      <Badge tone="neutral">{lead.stageName ?? "—"}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-ink-soft flex-wrap">
                    <span>{SOURCE_LABELS[lead.source] ?? lead.source}</span>
                    {lead.value && <span className="font-mono">₦{parseFloat(lead.value).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>}
                    {lead.score > 0 && (
                      <span className={`font-mono font-bold px-1.5 py-0.5 rounded ${
                        lead.score >= 70 ? "bg-register/12 text-register"
                        : lead.score >= 40 ? "bg-amber/14 text-[#9c6014]"
                        : "bg-paper-2 text-ink-soft"
                      }`}>
                        {lead.score}
                      </span>
                    )}
                    <span className="ml-auto">{lead.updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  </div>
                </Link>
              ))}
            </div>
          </Panel>
        )}
      </div>
    </>
  );
}
