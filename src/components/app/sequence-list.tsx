"use client";

import { useActionState, useState, useTransition } from "react";
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

interface Step {
  id: string;
  position: number;
  delayDays: number;
  action: string;
  subject: string | null;
  body: string;
}

interface Sequence {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  steps: Step[];
  enrollmentCount: number;
}

export function SequenceList({ sequences }: { sequences: Sequence[] }) {
  const [showForm, setShowForm] = useState(false);
  const [state, action, pending] = useActionState<SequenceFormState, FormData>(createSequence, {});
  const visible = showForm && !state.ok;

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
            <SequenceItem key={seq.id} sequence={seq} />
          ))}
        </div>
      )}
    </div>
  );
}

function SequenceItem({ sequence }: { sequence: Sequence }) {
  const [, startTransition] = useTransition();
  const [showStepForm, setShowStepForm] = useState(false);
  const [stepState, stepAction, stepPending] = useActionState<SequenceFormState, FormData>(addSequenceStep, {});
  const stepVisible = showStepForm && !stepState.ok;

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
            className="text-xs text-ink-soft hover:text-ink min-h-[36px] px-2 active:bg-paper-2 rounded"
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
            className="text-xs text-stamp hover:underline min-h-[36px] px-2 active:bg-stamp/10 rounded"
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
                <div className="text-xs text-ink-soft mt-0.5">{step.body}</div>
              </div>
              <button
                type="button"
                className="text-xs text-ink-soft hover:text-stamp"
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
        <form action={stepAction} className="bg-paper-2 rounded p-3 space-y-2 ml-4">
          <input type="hidden" name="sequenceId" value={sequence.id} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <Label>Delay (days)</Label>
              <Input name="delayDays" type="number" defaultValue="0" />
            </div>
            <div>
              <Label>Action</Label>
              <Select name="action" defaultValue="reminder">
                <option value="reminder">Create reminder</option>
                <option value="email">Send email</option>
                <option value="whatsapp">WhatsApp message</option>
              </Select>
            </div>
            <div>
              <Label>Subject (optional)</Label>
              <Input name="subject" placeholder="Follow-up call" />
            </div>
          </div>
          <div>
            <Label>Content</Label>
            <Textarea name="body" rows={2} placeholder="e.g. Call to check if they've reviewed the proposal" />
            {stepState.errors?.body && <p className="text-xs text-stamp mt-1">{stepState.errors.body[0]}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowStepForm(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={stepPending}>{stepPending ? "Adding…" : "Add step"}</Button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowStepForm(true)}
          className="text-xs font-semibold text-ink-soft hover:text-ink ml-4"
        >
          + Add step
        </button>
      )}
    </div>
  );
}
