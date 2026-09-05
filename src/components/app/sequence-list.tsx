"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  createSequence,
  deleteSequence,
  toggleSequenceActive,
  addSequenceStep,
  deleteSequenceStep,
  type SequenceFormState,
} from "@/app/actions/sequences";
import { Button } from "@/components/ui/button";
import { Label, Input, Textarea, Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { PlaceholderHelp } from "@/components/app/placeholder-help";
import { RichTextEditor } from "@/components/app/rich-text-editor";
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
}

interface Sequence {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  steps: Step[];
  enrollmentCount: number;
}

export function SequenceList({
  sequences,
  documents,
  orgName,
}: {
  sequences: Sequence[];
  documents: AttachmentDoc[];
  orgName: string;
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
            <SequenceItem key={seq.id} sequence={seq} documents={documents} orgName={orgName} />
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
}: {
  sequence: Sequence;
  documents: AttachmentDoc[];
  orgName: string;
}) {
  const [, startTransition] = useTransition();
  const [showStepForm, setShowStepForm] = useState(false);
  const [stepState, stepAction, stepPending] = useActionState<SequenceFormState, FormData>(addSequenceStep, {});
  const [stepActionType, setStepActionType] = useState<string>("reminder");
  const [emailBody, setEmailBody] = useState<string>("");
  const [emailSubject, setEmailSubject] = useState<string>("");
  const [emailSender, setEmailSender] = useState<string>("");
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  // Close on success: reset showStepForm so the form can be reopened.
  const stepVisible = showStepForm;
  useEffect(() => {
    if (stepState.ok) {
      setShowStepForm(false);
      setEmailBody("");
      setEmailSubject("");
      setEmailSender("");
      setAttachmentIds([]);
    }
  }, [stepState.ok]);

  return (
    <div className="px-3.5 sm:px-5 py-3.5 sm:py-4">
      <div className="flex items-start gap-3 mb-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{sequence.name}</span>
            <Badge tone={sequence.active ? "won" : "neutral"}>
              {sequence.active ? "Active" : "Paused"}
            </Badge>
          </div>
          {sequence.description && (
            <div className="text-xs text-ink-soft mt-0.5">{sequence.description}</div>
          )}
          <div className="text-xs text-ink-soft font-mono mt-1">
            {sequence.enrollmentCount} enrolled · {sequence.steps.length} steps
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
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

      {/* Steps */}
      {sequence.steps.length > 0 && (
        <ol className="space-y-1.5 mb-3 ml-4">
          {sequence.steps.map((step, idx) => (
            <li key={step.id} className="flex items-start gap-2 text-sm">
              <span className="font-mono text-xs text-ink-soft mt-0.5 w-6">{idx + 1}.</span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-ink-soft">
                    Day {step.delayDays}
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
                className="text-xs text-ink-soft hover:text-stamp min-w-[36px] min-h-[36px] flex items-center justify-center rounded hover:bg-paper-2"
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

      {/* Add step form */}
      {stepVisible ? (
        <form action={stepAction} className="bg-paper-2 rounded p-3 space-y-3 ml-4">
          <input type="hidden" name="sequenceId" value={sequence.id} />
          <input type="hidden" name="attachments" value={JSON.stringify(attachmentIds)} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <Label>Delay (days)</Label>
              <Input name="delayDays" type="number" defaultValue="0" />
            </div>
            <div>
              <Label>Action</Label>
              <Select
                name="action"
                defaultValue="reminder"
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
              <Textarea
                name="body"
                rows={3}
                placeholder="Hi {{first_name}}, this is {{rep_name}} from {{org_name}}. Following up on our conversation..."
                onChange={(e) => setEmailBody(e.currentTarget.value)}
              />
            )}
            {stepState.errors?.body && <p className="text-xs text-stamp mt-1">{stepState.errors.body[0]}</p>}
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
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowStepForm(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={stepPending}>{stepPending ? "Adding…" : "Add step"}</Button>
          </div>
        </form>
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

/** Strip HTML tags for preview display. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}
