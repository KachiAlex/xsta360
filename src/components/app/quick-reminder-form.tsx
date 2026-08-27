"use client";

import { useActionState, useState } from "react";
import { setReminder, type ActivityFormState } from "@/app/actions/activities";
import { Button } from "@/components/ui/button";
import { Label, Input, Select } from "@/components/ui/field";

const REMINDER_PRESETS = [
  { value: "", label: "Custom", offset: null },
  { value: "1h", label: "In 1 hour", offset: 60 * 60 * 1000 },
  { value: "tomorrow", label: "Tomorrow 9am", offset: null },
  { value: "3d", label: "In 3 days", offset: 3 * 24 * 60 * 60 * 1000 },
  { value: "1w", label: "In 1 week", offset: 7 * 24 * 60 * 60 * 1000 },
];

const REMINDER_NOTES = [
  { value: "Follow-up call", label: "Follow-up call" },
  { value: "Send quote", label: "Send quote" },
  { value: "Send proposal", label: "Send proposal" },
  { value: "Check in", label: "Check in" },
  { value: "Schedule meeting", label: "Schedule meeting" },
  { value: "Custom", label: "Custom note" },
];

function getDefaultDue(offset: number | null): string {
  const now = new Date();
  if (offset !== null) {
    return new Date(now.getTime() + offset).toISOString().slice(0, 16);
  }
  // Tomorrow 9am
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  return tomorrow.toISOString().slice(0, 16);
}

export function QuickReminderForm({ leadId }: { leadId: string }) {
  const [showForm, setShowForm] = useState(false);
  const [preset, setPreset] = useState("");
  const [dueAt, setDueAt] = useState(() => getDefaultDue(60 * 60 * 1000));
  const [noteMode, setNoteMode] = useState("Follow-up call");
  const [state, action, pending] = useActionState<ActivityFormState, FormData>(setReminder, {});

  const visible = showForm && !state.ok;

  function handlePresetChange(value: string) {
    setPreset(value);
    const presetItem = REMINDER_PRESETS.find((p) => p.value === value);
    if (presetItem) {
      setDueAt(getDefaultDue(presetItem.offset));
    }
  }

  return (
    <div className="border-t border-dashed border-rule pt-3 mt-3">
      {!visible ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="text-xs font-semibold text-ink-soft hover:text-ink transition-colors"
        >
          🔔 Set reminder
        </button>
      ) : (
        <form action={action} className="space-y-3">
          <input type="hidden" name="leadId" value={leadId} />

          {/* Quick presets */}
          <div className="flex flex-wrap gap-1.5">
            {REMINDER_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => handlePresetChange(p.value)}
                className={`text-[11px] font-mono px-2 py-1 rounded border transition-colors ${
                  preset === p.value
                    ? "bg-ink text-paper border-ink"
                    : "bg-paper border-rule text-ink-soft hover:border-ink"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>When</Label>
              <Input
                name="dueAt"
                type="datetime-local"
                value={dueAt}
                onChange={(e) => {
                  setDueAt(e.target.value);
                  setPreset("");
                }}
              />
              {state.errors?.dueAt && (
                <p className="text-xs text-stamp mt-1">{state.errors.dueAt[0]}</p>
              )}
            </div>
            <div>
              <Label>What to do</Label>
              <Select
                value={noteMode}
                onChange={(e) => setNoteMode(e.target.value)}
              >
                {REMINDER_NOTES.map((n) => (
                  <option key={n.value} value={n.value}>{n.label}</option>
                ))}
              </Select>
            </div>
          </div>

          {noteMode === "Custom" && (
            <div>
              <Label>Note</Label>
              <Input
                name="note"
                placeholder="e.g. Call back to discuss contract terms"
                autoFocus
              />
            </div>
          )}
          {noteMode !== "Custom" && (
            <input type="hidden" name="note" value={noteMode} />
          )}

          {state.message && (
            <p className="text-sm text-stamp bg-stamp/10 px-3 py-2 rounded">{state.message}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Setting…" : "Set reminder"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
