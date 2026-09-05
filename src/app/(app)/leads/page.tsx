import Link from "next/link";
import { requireAuth } from "@/lib/dal";
import { getOrgStages, getOrgMembers } from "@/lib/queries";
import { getLeads } from "@/lib/leads";
import { getOrgCategories } from "@/lib/category-queries";
import { Topbar } from "@/components/app/topbar";
import { AddLeadModal } from "@/components/app/add-lead-modal";
import { MobileFab } from "@/components/app/fab";
import { Panel, PanelHead } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/app/empty-state";
import { ExportLeadsButton } from "@/components/app/export-leads-button";
import { LeadsList } from "@/components/app/leads-list";

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
  searchParams: Promise<{ q?: string; stageId?: string; source?: string; assigneeId?: string; categoryId?: string }>;
}) {
  const ctx = await requireAuth();
  const filters = await props.searchParams;
  const [stages, members, leads, categories] = await Promise.all([
    getOrgStages(ctx.orgId),
    getOrgMembers(ctx.orgId),
    getLeads(ctx.orgId, filters),
    getOrgCategories(ctx.orgId),
  ]);

  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name, icon: c.icon, color: c.color }));

  return (
    <>
      <Topbar
        actions={
          <div className="flex gap-2 items-center flex-wrap">
            <Link href="/leads/import" className="text-sm font-semibold border border-ink rounded px-3 py-2 hover:bg-paper-2 min-h-[44px] flex items-center">
              Import CSV
            </Link>
            <ExportLeadsButton />
            <AddLeadModal stages={stages} members={members} currentUserId={ctx.userId} categories={categoryOptions} />
          </div>
        }
      />

      <div className="content flex-1 px-3 sm:px-6 lg:px-8 py-4 sm:py-7 max-w-[1240px] w-full mx-auto">
        <MobileFab>
          <AddLeadModal stages={stages} members={members} currentUserId={ctx.userId} categories={categoryOptions} />
        </MobileFab>

        {/* Mobile: Import CSV link */}
        <Link href="/leads/import" className="sm:hidden text-xs font-semibold text-ink-soft hover:text-ink mb-3 inline-flex items-center min-h-[36px] active:text-ink">
          📥 Import CSV
        </Link>

        {/* Filter bar */}
        <div className="mb-5">
          <form method="get" className="flex flex-col sm:flex-row gap-2 sm:flex-wrap">
            <input
              type="text"
              name="q"
              defaultValue={filters.q ?? ""}
              placeholder="Search by name, company, email, or phone..."
              className="text-sm border border-rule bg-panel rounded px-3 py-2.5 flex-1 min-w-0 sm:min-w-[200px] min-h-[44px]"
              aria-label="Search leads"
            />
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
            {categories.length > 0 && (
              <select name="categoryId" defaultValue={filters.categoryId ?? ""} className="text-sm border border-rule bg-panel rounded px-3 py-2.5 flex-1 min-w-0 sm:min-w-[120px] min-h-[44px]">
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
            )}
            <button type="submit" className="text-sm font-semibold border border-ink rounded px-4 py-2.5 hover:bg-paper-2 min-h-[44px] active:bg-paper-2">
              Apply
            </button>
            {(filters.stageId || filters.source || filters.assigneeId || filters.categoryId) && (
              <Link href="/leads" className="text-sm text-ink-soft underline underline-offset-2 self-center min-h-[44px] flex items-center justify-center px-2">
                Clear
              </Link>
            )}
          </form>
        </div>

        {leads.length === 0 ? (
          <EmptyState
            title={filters.q || filters.stageId || filters.source || filters.categoryId ? "No leads match your filters" : "No leads yet"}
            description={
              filters.q || filters.stageId || filters.source || filters.categoryId
                ? "Try adjusting your search or filters."
                : "Add your first lead to start tracking follow-ups and pipeline."
            }
            action={<AddLeadModal stages={stages} members={members} currentUserId={ctx.userId} categories={categoryOptions} />}
          />
        ) : (
          <Panel>
            <PanelHead title="Leads" sub={`${leads.length} total`} />
            <LeadsList
              leads={leads.map((l) => ({
                id: l.id,
                name: l.name,
                company: l.company,
                email: l.email,
                phone: l.phone,
                source: l.source,
                campaign: l.campaign,
                stageName: l.stageName,
                stageKind: l.stageKind ?? "",
                value: l.value,
                score: l.score,
                assigneeName: l.assigneeName,
                updatedAt: l.updatedAt.toISOString(),
                categories: l.categories,
              }))}
              categories={categoryOptions}
              members={members.map((m) => ({ userId: m.userId, name: m.name }))}
              stages={stages.map((s) => ({ id: s.id, name: s.name }))}
              canDelete={ctx.role === "admin" || ctx.role === "manager"}
            />
          </Panel>
        )}
      </div>
    </>
  );
}
