"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  createSequence,
  deleteSequence,
  toggleSequenceActive,
  addSequenceStep,
  deleteSequenceStep,
  updateSequenceStep,
  updateSequenceSettings,
  runSequenceNow,
  bulkEnrollLeads,
  unenrollLead,
  pauseEnrollment,
  resumeEnrollment,
  type SequenceFormState,
} from "@/app/actions/sequences";
import { Button } from "@/components/ui/button";
import { Label, Input, Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { PlaceholderHelp } from "@/components/app/placeholder-help";
import { RichTextEditor } from "@/components/app/rich-text-editor";
import { FormatTextarea } from "@/components/app/format-textarea";
import { EmailPreview } from "@/components/app/email-preview";
import { AttachmentPicker, type AttachmentDoc } from "@/components/app/attachment-picker";

interface Step {
  id: string;
  position: number;
  delayDays: number;
  action: string;
  subject: string | null;
  body: string;
  senderName: string | null;
  attachments: string[];
  variantBSubject: string | null;
  variantBBody: string | null;
  variantBSenderName: string | null;
}

interface Sequence {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  sendWindowStart: string | null;
  sendWindowEnd: string | null;
  skipWeekends: boolean;
  timezone: string;
  steps: Step[];
  enrollmentCount: number;
}

interface EnrollmentRow {
  enrollmentId: string;
  sequenceId: string;
  leadId: string;
  leadName: string;
  leadPhone: string | null;
  leadEmail: string | null;
  status: string;
  currentStep: number;
  enrolledAt: Date;
}

interface LeadOption {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  categoryIds: string[];
}

interface CategoryOption {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export function SequenceList({
  sequences,
  documents,
  orgName,
  enrollments,
  leads,
  categories,
}: {
  sequences: Sequence[];
  documents: AttachmentDoc[];
  orgName: string;
  enrollments: EnrollmentRow[];
  leads: LeadOption[];
  categories: CategoryOption[];
}) {
  const [showForm, setShowForm] = useState(false);
  const [state, action, pending] = useActionState<SequenceFormState, FormData>(createSequence, {});
  // Close on success: reset showForm so the form can be reopened.
  const visible = showForm;
  useEffect(() => {
    if (state.ok) setShowForm(false);
  }, [state.ok]);

  return (
    <div>
      <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-rule">
        <Button type="button" size="sm" onClick={() => setShowForm(true)}>+ New sequence</Button>
      </div>

      {visible && (
        <form action={action} className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-rule space-y-3 bg-paper-2">
          <div>
            <Label>Sequence name</Label>
            <Input name="name" placeholder="e.g. New lead follow-up" autoFocus />
            {state.errors?.name && <p className="text-xs text-stamp mt-1">{state.errors.name[0]}</p>}
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Input name="description" placeholder="e.g. 5-step drip for inbound leads" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={pending}>{pending ? "Creating…" : "Create"}</Button>
          </div>
        </form>
      )}

      {sequences.length === 0 && !visible ? (
        <div className="px-5 py-12 text-center text-sm text-ink-soft">
          No sequences yet. Create one to automate your follow-up process.
        </div>
      ) : (
        <div className="divide-y divide-rule">
          {sequences.map((seq) => (
            <SequenceItem
              key={seq.id}
              sequence={seq}
              documents={documents}
              orgName={orgName}
              enrollments={enrollments.filter((e) => e.sequenceId === seq.id)}
              leads={leads}
              categories={categories}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SequenceItem({
  sequence,
  documents,
  orgName,
  enrollments,
  leads,
  categories,
}: {
  sequence: Sequence;
  documents: AttachmentDoc[];
  orgName: string;
  enrollments: EnrollmentRow[];
  leads: LeadOption[];
  categories: CategoryOption[];
}) {
  const [, startTransition] = useTransition();
  const [showStepForm, setShowStepForm] = useState(false);
  const [editingStep, setEditingStep] = useState<Step | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [showLeads, setShowLeads] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [enrollMsg, setEnrollMsg] = useState<string | null>(null);

  // Leads already committed to this sequence (active, in-flight send, or
  // paused) can't be picked again.
  const visibleEnrollments = enrollments.filter((e) => e.status !== "cancelled");
  const committedLeadIds = new Set(
    enrollments
      .filter((e) => e.status === "active" || e.status === "paused" || e.status === "processing")
      .map((e) => e.leadId),
  );
  const q = pickerQuery.trim().toLowerCase();
  // Leads that can still be enrolled — "All contacts" and category
  // quick-selects draw from this set regardless of the search filter.
  const enrollableLeads = leads.filter((l) => !committedLeadIds.has(l.id));
  const pickableLeads = enrollableLeads.filter(
    (l) =>
      !q ||
      l.name.toLowerCase().includes(q) ||
      (l.company ?? "").toLowerCase().includes(q) ||
      (l.phone ?? "").includes(q) ||
      (l.email ?? "").toLowerCase().includes(q),
  );

  function toggleLeadPick(id: string) {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllContacts() {
    setSelectedLeadIds(new Set(enrollableLeads.map((l) => l.id)));
  }

  function selectCategory(categoryId: string) {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      for (const l of enrollableLeads) {
        if (l.categoryIds.includes(categoryId)) next.add(l.id);
      }
      return next;
    });
  }

  function submitEnrollment() {
    if (selectedLeadIds.size === 0) return;
    const fd = new FormData();
    fd.set("sequenceId", sequence.id);
    fd.set("leadIds", [...selectedLeadIds].join(","));
    startTransition(async () => {
      const res = await bulkEnrollLeads({}, fd);
      setEnrollMsg(res.message ?? (res.ok ? "Done" : "Failed"));
      if (res.ok) {
        setSelectedLeadIds(new Set());
        setShowPicker(false);
        setPickerQuery("");
      }
    });
  }

  function enrollmentAction(enrollmentId: string, fn: typeof unenrollLead) {
    const fd = new FormData();
    fd.set("enrollmentId", enrollmentId);
    startTransition(async () => {
      await fn({}, fd);
    });
  }

  return (
    <div className="px-3.5 sm:px-5 py-3.5 sm:py-4">
      <div className="flex items-start gap-3 mb-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{sequence.name}</span>
            <Badge tone={sequence.active ? "won" : "neutral"}>
              {sequence.active ? "Active" : "Paused"}
            </Badge>
            {sequence.steps.length === 0 && (
              <Badge tone="lost">No steps — nothing will send</Badge>
            )}
          </div>
          {sequence.description && (
            <div className="text-xs text-ink-soft mt-0.5">{sequence.description}</div>
          )}
          <div className="text-xs text-ink-soft font-mono mt-1">
            {sequence.enrollmentCount} enrolled · {sequence.steps.length} steps
            {sequence.sendWindowStart && sequence.sendWindowEnd && (
              <span className="ml-2">· ⏰ {sequence.sendWindowStart}–{sequence.sendWindowEnd} {sequence.timezone}</span>
            )}
            {sequence.skipWeekends && <span className="ml-2">· No weekends</span>}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <a
            href={`/sequences/${sequence.id}`}
            className="text-xs text-ink-soft hover:text-ink min-h-[40px] px-2 active:bg-paper-2 rounded flex items-center"
          >
            📊 Analytics
          </a>
          <button
            type="button"
            className="text-xs text-ink-soft hover:text-ink min-h-[40px] px-2 active:bg-paper-2 rounded"
            onClick={() => setShowSettings((v) => !v)}
          >
            ⚙ Settings
          </button>
          <button
            type="button"
            disabled={running}
            className="text-xs text-[var(--accent)] hover:text-ink min-h-[40px] px-2 active:bg-paper-2 rounded disabled:opacity-50"
            onClick={() => {
              setRunning(true);
              setRunMsg(null);
              const fd = new FormData();
              fd.set("sequenceId", sequence.id);
              startTransition(async () => {
                const res = await runSequenceNow({}, fd);
                setRunning(false);
                setRunMsg(res.message ?? (res.ok ? "Done" : "Failed"));
              });
            }}
          >
            {running ? "Running…" : "▶ Run now"}
          </button>
          <button
            type="button"
            className="text-xs text-ink-soft hover:text-ink min-h-[40px] px-2 active:bg-paper-2 rounded"
            onClick={() => {
              const fd = new FormData();
              fd.set("id", sequence.id);
              startTransition(async () => {
                await toggleSequenceActive({}, fd);
              });
            }}
          >
            {sequence.active ? "Pause" : "Activate"}
          </button>
          <button
            type="button"
            className="text-xs text-stamp hover:underline min-h-[40px] px-2 active:bg-stamp/10 rounded"
            onClick={() => {
              if (!confirm("Delete this sequence?")) return;
              const fd = new FormData();
              fd.set("id", sequence.id);
              startTransition(async () => {
                await deleteSequence({}, fd);
              });
            }}
          >
            Delete
          </button>
        </div>
      </div>

      {runMsg && (
        <div className="text-xs font-mono text-ink-soft mb-3 ml-1">{runMsg}</div>
      )}

      {/* Send-window settings */}
      {showSettings && (
        <SequenceSettingsForm sequence={sequence} onDone={() => setShowSettings(false)} />
      )}

      {/* Steps */}
      {sequence.steps.length > 0 && (
        <ol className="space-y-1.5 mb-3 ml-4">
          {sequence.steps.map((step, idx) => (
            <li key={step.id} className="flex items-start gap-2 text-sm">
              <span className="font-mono text-xs text-ink-soft mt-0.5 w-6">{idx + 1}.</span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-ink-soft">
                    {idx === 0 ? `Day ${step.delayDays}` : `+${step.delayDays}d`}
                  </span>
                  <Badge tone="neutral">{step.action}</Badge>
                  {step.subject && <span className="text-xs font-semibold">{step.subject}</span>}
                </div>
                {step.action === "email" && step.senderName && (
                  <div className="text-[11px] text-ink-soft mt-0.5">From: {step.senderName}</div>
                )}
                {step.action === "email" && step.attachments && step.attachments.length > 0 && (
                  <div className="text-[11px] text-ink-soft mt-0.5">📎 {step.attachments.length} attachment{step.attachments.length === 1 ? "" : "s"}</div>
                )}
                <div className="text-xs text-ink-soft mt-0.5 line-clamp-2">{stripHtml(step.body)}</div>
              </div>
              <button
                type="button"
                className="text-xs text-ink-soft hover:text-ink min-w-[36px] min-h-[36px] flex items-center justify-center rounded hover:bg-paper-2"
                title="Edit step"
                onClick={() => {
                  setEditingStep(step);
                  setShowStepForm(false);
                }}
              >
                ✎
              </button>
              <button
                type="button"
                className="text-xs text-ink-soft hover:text-stamp min-w-[36px] min-h-[36px] flex items-center justify-center rounded hover:bg-paper-2"
                title="Delete step"
                onClick={() => {
                  const fd = new FormData();
                  fd.set("id", step.id);
                  startTransition(async () => {
                    await deleteSequenceStep({}, fd);
                  });
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ol>
      )}

      {/* Enrolled leads — who this sequence targets */}
      <div className="mb-3 ml-4">
        <button
          type="button"
          onClick={() => setShowLeads((v) => !v)}
          className="text-xs font-semibold text-ink-soft hover:text-ink min-h-[36px] px-2 -ml-2 rounded active:bg-paper-2"
        >
          {showLeads ? "▾" : "▸"} 👥 Leads ({visibleEnrollments.length})
        </button>

        {showLeads && (
          <div className="mt-1 space-y-1.5">
            {visibleEnrollments.length === 0 && (
              <p className="text-xs text-ink-soft">No leads enrolled — add leads below, or enroll from a lead's page.</p>
            )}
            {visibleEnrollments.map((e) => (
              <div key={e.enrollmentId} className="flex items-center gap-2 text-sm">
                <a href={`/leads/${e.leadId}`} className="font-medium hover:underline truncate">
                  {e.leadName}
                </a>
                <Badge tone={e.status === "active" || e.status === "processing" ? "won" : e.status === "completed" ? "neutral" : "lost"}>
                  {e.status}
                </Badge>
                <span className="text-[11px] font-mono text-ink-soft">
                  {e.currentStep}/{sequence.steps.length} steps
                </span>
                <span className="ml-auto flex gap-1">
                  {e.status === "active" && (
                    <button
                      type="button"
                      className="text-[11px] text-ink-soft hover:text-ink px-1.5 py-1 rounded active:bg-paper-2"
                      onClick={() => enrollmentAction(e.enrollmentId, pauseEnrollment)}
                    >
                      Pause
                    </button>
                  )}
                  {/* Paused — or completed with new steps still pending. */}
                  {(e.status === "paused" ||
                    (e.status === "completed" && e.currentStep < sequence.steps.length)) && (
                    <button
                      type="button"
                      className="text-[11px] text-[var(--accent)] hover:text-ink px-1.5 py-1 rounded active:bg-paper-2"
                      onClick={() => enrollmentAction(e.enrollmentId, resumeEnrollment)}
                    >
                      {e.status === "completed" ? "Resume (new steps)" : "Resume"}
                    </button>
                  )}
                  {e.status !== "completed" && e.status !== "cancelled" && (
                    <button
                      type="button"
                      className="text-[11px] text-stamp hover:underline px-1.5 py-1 rounded active:bg-stamp/10"
                      onClick={() => {
                        if (!confirm(`Remove ${e.leadName} from this sequence?`)) return;
                        enrollmentAction(e.enrollmentId, unenrollLead);
                      }}
                    >
                      Remove
                    </button>
                  )}
                </span>
              </div>
            ))}

            {/* Add-leads picker — always visible; disabled with an explanation
                when the sequence can't accept enrollments. */}
            <div className="pt-1">
              {!showPicker ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    disabled={!sequence.active}
                    onClick={() => setShowPicker(true)}
                    className="text-xs text-[var(--accent)] hover:underline min-h-[36px] px-1.5 rounded active:bg-paper-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:no-underline"
                  >
                    + Add leads
                  </button>
                  {!sequence.active && (
                    <span className="text-[11px] text-ink-soft">
                      Sequence is paused — activate it to enroll leads.
                    </span>
                  )}
                </div>
              ) : (
                  <div className="bg-paper-2 rounded p-3 space-y-2">
                    <Input
                      placeholder="Search leads by name, company, phone…"
                      value={pickerQuery}
                      onChange={(e) => setPickerQuery(e.currentTarget.value)}
                      autoFocus
                    />
                    {sequence.steps.length === 0 && (
                      <p className="text-[11px] text-ink-soft">
                        No steps yet — enrolled leads will wait at the start until you add steps.
                      </p>
                    )}
                    {/* Quick select: all contacts or everyone in a category (tag) */}
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={enrollableLeads.length === 0}
                        onClick={selectAllContacts}
                        className="text-xs px-2.5 py-1.5 min-h-[36px] rounded border border-rule bg-paper hover:bg-paper-2 transition-colors disabled:opacity-50"
                      >
                        All contacts ({enrollableLeads.length})
                      </button>
                      {categories.map((cat) => {
                        const n = enrollableLeads.filter((l) => l.categoryIds.includes(cat.id)).length;
                        if (n === 0) return null;
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => selectCategory(cat.id)}
                            className="text-xs px-2.5 py-1.5 min-h-[36px] rounded border border-rule bg-paper hover:bg-paper-2 flex items-center gap-1 transition-colors"
                          >
                            <span>{cat.icon}</span>
                            <span>{cat.name}</span>
                            <span className="text-[10px] text-ink-soft">({n})</span>
                          </button>
                        );
                      })}
                      {selectedLeadIds.size > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedLeadIds(new Set())}
                          className="text-xs px-2.5 py-1.5 min-h-[36px] rounded border border-rule bg-paper hover:bg-paper-2 text-ink-soft transition-colors"
                        >
                          Clear ({selectedLeadIds.size})
                        </button>
                      )}
                    </div>
                    <div className="max-h-48 overflow-y-auto divide-y divide-rule">
                      {pickableLeads.length === 0 && (
                        <p className="text-xs text-ink-soft py-2">No matching leads available to enroll.</p>
                      )}
                      {pickableLeads.map((l) => (
                        <label key={l.id} className="flex items-center gap-2 py-1.5 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedLeadIds.has(l.id)}
                            onChange={() => toggleLeadPick(l.id)}
                            className="accent-[var(--accent)]"
                          />
                          <span className="font-medium truncate">{l.name}</span>
                          {l.company && <span className="text-xs text-ink-soft truncate">{l.company}</span>}
                          {!l.phone && !l.email && (
                            <span className="text-[10px] text-stamp">no contact info</span>
                          )}
                        </label>
                      ))}
                    </div>
                    {enrollMsg && <p className="text-xs font-mono text-ink-soft">{enrollMsg}</p>}
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="ghost" size="sm" onClick={() => { setShowPicker(false); setSelectedLeadIds(new Set()); setPickerQuery(""); }}>
                        Cancel
                      </Button>
                      <Button type="button" size="sm" disabled={selectedLeadIds.size === 0} onClick={submitEnrollment}>
                        Enroll {selectedLeadIds.size > 0 ? `${selectedLeadIds.size} ` : ""}lead{selectedLeadIds.size === 1 ? "" : "s"}
                      </Button>
                    </div>
                  </div>
              )}
            </div>

          </div>
        )}
        {enrollMsg && !showPicker && <p className="text-xs font-mono text-ink-soft mt-1">{enrollMsg}</p>}
      </div>

      {/* Step form — shared for adding a new step and editing an existing one */}
      {showStepForm || editingStep ? (
        <StepForm
          key={editingStep?.id ?? "new"}
          sequenceId={sequence.id}
          step={editingStep}
          documents={documents}
          orgName={orgName}
          onDone={() => {
            setShowStepForm(false);
            setEditingStep(null);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowStepForm(true)}
          className="text-xs font-semibold text-ink-soft hover:text-ink ml-4 min-h-[40px] px-2"
        >
          + Add step
        </button>
      )}
    </div>
  );
}

/** Step add/edit form — same fields, prefilled when editing. */
function StepForm({
  sequenceId,
  step,
  documents,
  orgName,
  onDone,
}: {
  sequenceId: string;
  step: Step | null;
  documents: AttachmentDoc[];
  orgName: string;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<SequenceFormState, FormData>(
    step ? updateSequenceStep : addSequenceStep,
    {},
  );
  const [stepActionType, setStepActionType] = useState<string>(step?.action ?? "reminder");
  const [emailBody, setEmailBody] = useState<string>(step?.body ?? "");
  const [emailSubject, setEmailSubject] = useState<string>(step?.subject ?? "");
  const [emailSender, setEmailSender] = useState<string>(step?.senderName ?? "");
  const [attachmentIds, setAttachmentIds] = useState<string[]>(step?.attachments ?? []);

  // Close on success — parent clears the form state.
  useEffect(() => {
    if (state.ok) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok]);

  return (
    <form action={action} className="bg-paper-2 rounded p-3 space-y-3 ml-4">
      <input type="hidden" name="sequenceId" value={sequenceId} />
      {step && <input type="hidden" name="stepId" value={step.id} />}
      <input type="hidden" name="attachments" value={JSON.stringify(attachmentIds)} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <Label>Delay (days)</Label>
          <Input name="delayDays" type="number" defaultValue={step?.delayDays ?? 0} />
          <p className="text-[11px] text-ink-soft mt-1">
            Days to wait after enrollment for the first step, or after the previous step for the rest.
          </p>
        </div>
        <div>
          <Label>Action</Label>
          <Select
            name="action"
            defaultValue={step?.action ?? "reminder"}
            onChange={(e) => {
              const v = e.currentTarget.value;
              setStepActionType(v);
            }}
          >
            <option value="reminder">Create reminder</option>
            <option value="email">Send email</option>
            <option value="whatsapp">WhatsApp message</option>
          </Select>
        </div>
        <div>
          <Label>Subject {stepActionType === "email" ? "" : "(optional)"}</Label>
          <Input
            name="subject"
            defaultValue={step?.subject ?? ""}
            placeholder={stepActionType === "email" ? "Welcome to Xsta360" : "Follow-up call"}
            onChange={(e) => setEmailSubject(e.currentTarget.value)}
          />
        </div>
      </div>

      {/* Sender name — only for email steps */}
      {stepActionType === "email" && (
        <div>
          <Label>Sender name (displayed to recipient)</Label>
          <Input
            name="senderName"
            defaultValue={step?.senderName ?? ""}
            placeholder="e.g. Tunde from Kreatix"
            onChange={(e) => setEmailSender(e.currentTarget.value)}
          />
          <p className="text-[11px] text-ink-soft mt-1">This appears as the sender's display name in the recipient's inbox. Defaults to your org name if left blank.</p>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-1">
          <Label>Content {stepActionType === "email" ? "(rich text)" : ""}</Label>
          {stepActionType === "email" && (
            <EmailPreview
              subject={emailSubject}
              senderName={emailSender}
              body={emailBody}
              orgName={orgName}
              recipientName="Adaeze Okonkwo"
              attachments={documents
                .filter((d) => attachmentIds.includes(d.id))
                .map((d) => ({ fileName: d.fileName, sizeBytes: d.sizeBytes }))}
            />
          )}
        </div>
        {stepActionType === "email" ? (
          <RichTextEditor
            name="body"
            placeholder="Hi {{first_name}}, this is {{rep_name}} from {{org_name}}. Following up on our conversation..."
            rows={6}
            defaultValue={emailBody}
            onChange={setEmailBody}
          />
        ) : (
          <FormatTextarea
            name="body"
            rows={3}
            placeholder="Hi {{first_name}}, this is {{rep_name}} from {{org_name}}. Following up on our conversation..."
            value={emailBody}
            onChange={setEmailBody}
          />
        )}
        {state.errors?.body && <p className="text-xs text-stamp mt-1">{state.errors.body[0]}</p>}
        <div className="mt-1.5">
          <PlaceholderHelp />
        </div>
      </div>

      {/* Attachments — only for email steps */}
      {stepActionType === "email" && (
        <div>
          <Label>Attachments</Label>
          <AttachmentPicker
            documents={documents}
            selectedIds={attachmentIds}
            onChange={setAttachmentIds}
          />
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>Cancel</Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : step ? "Save changes" : "Add step"}
        </Button>
      </div>
    </form>
  );
}

/** Per-sequence sending window settings (business hours, weekends, timezone). */
function SequenceSettingsForm({ sequence, onDone }: { sequence: Sequence; onDone: () => void }) {
  const [state, action, pending] = useActionState<SequenceFormState, FormData>(updateSequenceSettings, {});

  useEffect(() => {
    if (state.ok) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok]);

  return (
    <form action={action} className="bg-paper-2 rounded p-3 space-y-3 mb-3 ml-4">
      <input type="hidden" name="sequenceId" value={sequence.id} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <Label>Send window start</Label>
          <Input name="sendWindowStart" type="time" defaultValue={sequence.sendWindowStart ?? ""} />
        </div>
        <div>
          <Label>Send window end</Label>
          <Input name="sendWindowEnd" type="time" defaultValue={sequence.sendWindowEnd ?? ""} />
        </div>
        <div>
          <Label>Timezone</Label>
          <Input name="timezone" defaultValue={sequence.timezone || "Africa/Lagos"} placeholder="Africa/Lagos" />
        </div>
      </div>
      <p className="text-[11px] text-ink-soft">
        Email and WhatsApp steps only send inside this window; reminder steps fire anytime.
        Leave the times empty to send around the clock.
      </p>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          name="skipWeekends"
          value="true"
          defaultChecked={sequence.skipWeekends}
          className="accent-[var(--accent)]"
        />
        Skip weekends (Sat / Sun)
      </label>
      {state.message && <p className="text-xs text-stamp">{state.message}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>Cancel</Button>
        <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Save settings"}</Button>
      </div>
    </form>
  );
}

/** Strip HTML tags for preview display. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}
