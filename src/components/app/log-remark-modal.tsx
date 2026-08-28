"use client";

import { useActionState, useEffect, useState } from "react";
import { addRemark, type LeadFormState } from "@/app/actions/leads";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Label, Textarea, Input } from "@/components/ui/field";
import { DictationButton } from "@/components/app/dictation-button";

export interface LogRemarkModalProps {
  leadId: string;
  leadName: string;
  leadCompany?: string | null;
  /** Trigger label (defaults to "Log remark"). */
  triggerLabel?: string;
  triggerVariant?: "primary" | "ghost";
  triggerClassName?: string;
}

export function LogRemarkModal({
  leadId,
  leadName,
  leadCompany,
  triggerLabel = "Log remark",
  triggerVariant = "primary",
  triggerClassName = "",
}: LogRemarkModalProps) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<LeadFormState, FormData>(addRemark, {});

  // Close on success: reset open state so the modal can be reopened.
  const showOpen = open;
  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state.ok]);
  const sub = leadCompany ? `${leadName} · ${leadCompany}` : leadName;

  return (
    <>
      <Button
        type="button"
        variant={triggerVariant}
        size="sm"
        className={triggerClassName}
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </Button>

      <Modal open={showOpen} onClose={() => setOpen(false)} title="Log a remark" sub={sub}>
        <form action={action} className="space-y-4">
          <input type="hidden" name="leadId" value={leadId} />
          <div>
            <Label>What happened?</Label>
            <Textarea
              id="remark-body"
              name="body"
              rows={3}
              placeholder="e.g. Called, asked for revised quote by Friday"
              autoFocus
            />
            <div className="mt-1.5">
              <DictationButton targetId="remark-body" label="Dictate remark" />
            </div>
            {state.errors?.body && <p className="text-xs text-stamp mt-1">{state.errors.body[0]}</p>}
          </div>
          <div>
            <Label>Set next follow-up</Label>
            <Input name="reminderDue" type="datetime-local" />
          </div>

          {state.message && (
            <p className="text-sm text-stamp bg-stamp/10 px-3 py-2 rounded">{state.message}</p>
          )}

          <div className="flex justify-end gap-2.5 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save & set reminder"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
