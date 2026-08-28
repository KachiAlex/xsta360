"use client";

import { useActionState, useEffect, useState } from "react";

function toLocalDatetimeInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
import { logActivity, type ActivityFormState } from "@/app/actions/activities";
import { Button } from "@/components/ui/button";
import { Label, Textarea, Input, Select } from "@/components/ui/field";
import { DictationButton } from "@/components/app/dictation-button";

const ACTIVITY_TYPES = [
  { value: "call", label: "📞 Call" },
  { value: "email", label: "✉️ Email" },
  { value: "meeting", label: "🤝 Meeting" },
  { value: "visit", label: "📍 Visit" },
  { value: "note", label: "📝 Note" },
];

const REMINDER_TYPES = [
  { value: "", label: "—" },
  { value: "Follow-up call", label: "Follow-up call" },
  { value: "Send quote", label: "Send quote" },
  { value: "Send proposal", label: "Send proposal" },
  { value: "Check in", label: "Check in" },
  { value: "Schedule meeting", label: "Schedule meeting" },
];

export function ActivityForm({ leadId }: { leadId: string }) {
  const [showForm, setShowForm] = useState(false);
  const [state, action, pending] = useActionState<ActivityFormState, FormData>(logActivity, {});

  // Close on success: reset showForm so the form can be reopened.
  const visible = showForm;
  useEffect(() => {
    if (state.ok) setShowForm(false);
  }, [state.ok]);

  return (
    <div className="border-t border-dashed border-rule pt-3 mt-3">
      {!visible ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="text-xs font-semibold text-ink-soft hover:text-ink transition-colors"
        >
          + Log activity
        </button>
      ) : (
        <form action={action} className="space-y-3">
          <input type="hidden" name="leadId" value={leadId} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select name="type" defaultValue="call">
                {ACTIVITY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>When</Label>
              <Input
                name="occurredAt"
                type="datetime-local"
                defaultValue={toLocalDatetimeInput(new Date())}
              />
            </div>
          </div>

          <div>
            <Label>What happened?</Label>
            <Textarea
              id="activity-body"
              name="body"
              rows={2}
              placeholder="e.g. Called, discussed pricing — they'll review internally"
              autoFocus
            />
            <div className="mt-1.5">
              <DictationButton targetId="activity-body" label="Dictate activity" />
            </div>
            {state.errors?.body && (
              <p className="text-xs text-stamp mt-1">{state.errors.body[0]}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Next follow-up (optional)</Label>
              <Input name="reminderDue" type="datetime-local" />
            </div>
            <div>
              <Label>Follow-up type</Label>
              <Select name="reminderType" defaultValue="">
                {REMINDER_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>
            </div>
          </div>

          {state.message && (
            <p className="text-sm text-stamp bg-stamp/10 px-3 py-2 rounded">{state.message}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save activity"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
