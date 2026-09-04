import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/dal";
import { getOrgStages, getOrgMembers } from "@/lib/queries";
import { getLeadDetail, getLeadHistory, getLeadReminders } from "@/lib/lead-detail";
import { getOrgSequences, getLeadEnrollments } from "@/lib/sequence-queries";
import { Topbar } from "@/components/app/topbar";
import { LogRemarkModal } from "@/components/app/log-remark-modal";
import { EditLeadModal } from "@/components/app/edit-lead-modal";
import { StageSelect } from "@/components/app/stage-select";
import { LeadSequences } from "@/components/app/lead-sequences";
import { Panel, PanelHead } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { reminderCalendarUrl } from "@/lib/calendar";

const SOURCE_LABELS: Record<string, string> = {
  referral: "Referral",
  social: "Social",
  ad: "Ad campaign",
  walk_in: "Walk-in",
  embedded_form: "Website form",
  other: "Other",
};

const EVENT_LABELS: Record<string, string> = {
  lead_created: "Lead created",
  lead_won: "Marked as Won",
  lead_lost: "Marked as Lost",
  stage_changed: "Stage changed",
  lead_assigned: "Reassigned",
  reminder_set: "Follow-up set",
  reminder_snoozed: "Follow-up snoozed",
  reminder_completed: "Follow-up completed",
  remark_added: "Remark added",
};

function formatDateTime(d: Date): string {
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth();
  const { id } = await params;

  const [lead, stages, members] = await Promise.all([
    getLeadDetail(ctx.orgId, id),
    getOrgStages(ctx.orgId),
    getOrgMembers(ctx.orgId),
  ]);

  if (!lead) notFound();

  const [history, reminders, sequences, enrollments] = await Promise.all([
    getLeadHistory(ctx.orgId, id),
    getLeadReminders(ctx.orgId, id),
    getOrgSequences(ctx.orgId),
    getLeadEnrollments(ctx.orgId, id),
  ]);

  return (
    <>
      <Topbar>
        <Link href="/leads" className="text-sm text-ink-soft hover:text-ink px-3 py-2 min-h-[40px] flex items-center active:text-ink">
          ← Leads
        </Link>
      </Topbar>

      <div className="content flex-1 px-3 sm:px-6 lg:px-8 py-4 sm:py-7 max-w-[1240px] w-full mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          {/* Main: header + history */}
          <div className="space-y-5 sm:space-y-6 min-w-0">
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h1 className="font-mono text-lg sm:text-2xl m-0">{lead.name}</h1>
                {lead.stageKind === "won" && <Badge tone="won">Won</Badge>}
                {lead.stageKind === "lost" && <Badge tone="lost">Lost</Badge>}
              </div>
              {lead.company && <p className="text-ink-soft text-sm">{lead.company}</p>}
            </div>

            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <StageSelect
                leadId={lead.id}
                stages={stages}
                currentStageId={lead.stageId}
              />
              <EditLeadModal
                lead={lead}
                stages={stages}
                members={members}
                currentUserId={ctx.userId}
              />
              <LogRemarkModal
                leadId={lead.id}
                leadName={lead.name}
                leadCompany={lead.company}
              />
            </div>

            {/* History timeline */}
            <Panel>
              <PanelHead title="History" sub={`${history.length} entries`} />
              {history.length === 0 ? (
                <div className="px-5 py-10 text-center text-ink-soft text-sm">
                  No activity yet. Log a remark to start the timeline.
                </div>
              ) : (
                <ol className="divide-y divide-dashed divide-rule">
                  {history.map((entry, i) => (
                    <li key={i} className="px-4 sm:px-5 py-3 sm:py-4">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline gap-1 sm:gap-4">
                        <div className="min-w-0">
                          <span className="font-mono text-xs text-ink-soft uppercase tracking-wider">
                            {entry.type === "remark" ? "Remark" : EVENT_LABELS[entry.type] ?? entry.type}
                          </span>
                          {entry.type === "remark" && entry.body && (
                            <p className="text-sm mt-1">{entry.body}</p>
                          )}
                          {entry.type === "lead_lost" && Boolean(entry.meta?.lostReasonText) && (
                            <p className="text-sm mt-1 text-stamp">
                              {"Reason: " + String(entry.meta?.lostReasonText)}
                            </p>
                          )}
                          {entry.type === "stage_changed" && Boolean(entry.meta?.toStageName) && (
                            <p className="text-sm mt-1 text-ink-soft">
                              {"Moved to " + String(entry.meta?.toStageName)}
                            </p>
                          )}
                        </div>
                        <div className="text-left sm:text-right shrink-0 text-xs text-ink-soft">
                          <div>{formatDateTime(entry.at)}</div>
                          {entry.authorName && (
                            <div className="font-mono">{entry.authorName}</div>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          </div>

          {/* Sidebar: lead info + reminders */}
          <div className="space-y-6">
            <Panel>
              <PanelHead title="Details" />
              <dl className="px-4 sm:px-5 py-4 space-y-3 text-sm">
                <div>
                  <dt className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">Source</dt>
                  <dd>{SOURCE_LABELS[lead.source] ?? lead.source}</dd>
                </div>
                {lead.campaign && (
                  <div>
                    <dt className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">Campaign</dt>
                    <dd>{lead.campaign}</dd>
                  </div>
                )}
                {lead.email && (
                  <div>
                    <dt className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">Email</dt>
                    <dd>{lead.email}</dd>
                  </div>
                )}
                {lead.phone && (
                  <div>
                    <dt className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">Phone</dt>
                    <dd>{lead.phone}</dd>
                  </div>
                )}
                <div>
                  <dt className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">Assignee</dt>
                  <dd>{lead.assigneeName ?? "Unassigned"}</dd>
                </div>
                {lead.notes && (
                  <div>
                    <dt className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">Notes</dt>
                    <dd className="whitespace-pre-wrap">{lead.notes}</dd>
                  </div>
                )}
                {lead.lostReasonText && (
                  <div>
                    <dt className="font-mono text-[11px] uppercase tracking-wider text-stamp">Lost reason</dt>
                    <dd className="text-stamp">{lead.lostReasonText}</dd>
                  </div>
                )}
              </dl>
            </Panel>

            <Panel>
              <PanelHead title="Reminders" />
              {reminders.length === 0 ? (
                <div className="px-5 py-6 text-center text-ink-soft text-sm">
                  No reminders set.
                </div>
              ) : (
                <ul className="divide-y divide-dashed divide-rule">
                  {reminders.map((r) => (
                    <li key={r.id} className="px-4 sm:px-5 py-3 flex justify-between items-center gap-2 flex-wrap">
                      <div className="min-w-0">
                        <div className="text-sm">{formatDateTime(r.dueAt)}</div>
                        {r.note && <div className="text-xs text-ink-soft">{r.note}</div>}
                        {r.status === "pending" && (
                          <a
                            href={reminderCalendarUrl({
                              leadName: lead.name,
                              leadCompany: lead.company,
                              dueAt: r.dueAt,
                              note: r.note,
                              leadPhone: lead.phone,
                            })}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-semibold text-ink-soft hover:text-ink mt-1 inline-flex items-center gap-1 active:text-ink"
                            title="Add to Google Calendar"
                          >
                            📅 Add to Google Calendar
                          </a>
                        )}
                      </div>
                      <Badge
                        tone={
                          r.status === "completed" ? "won" :
                          r.status === "failed" ? "lost" :
                          r.dueAt < new Date() ? "overdue" : "today"
                        }
                      >
                        {r.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            {/* Sequences panel */}
            {sequences.length > 0 && (
              <Panel>
                <PanelHead title="Sequences" sub="Automated drip campaigns" />
                <LeadSequences
                  leadId={id}
                  sequences={sequences.map((s) => ({
                    id: s.id,
                    name: s.name,
                    description: s.description,
                    active: s.active,
                    stepCount: s.steps.length,
                  }))}
                  enrollments={enrollments.map((e) => ({
                    enrollmentId: e.enrollmentId,
                    sequenceId: e.sequenceId,
                    sequenceName: e.sequenceName,
                    status: e.status,
                    currentStep: e.currentStep,
                    totalSteps: e.totalSteps,
                    enrolledAt: e.enrolledAt.toISOString(),
                    completedAt: e.completedAt?.toISOString() ?? null,
                  }))}
                />
              </Panel>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
