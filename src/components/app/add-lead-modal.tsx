"use client";

import { useActionState, useState } from "react";
import { createLead, type LeadFormState } from "@/app/actions/leads";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/field";

export interface AddLeadModalProps {
  stages: { id: string; name: string }[];
  members: { userId: string; name: string }[];
  currentUserId: string;
}

const SOURCES: { value: string; label: string }[] = [
  { value: "referral", label: "Referral" },
  { value: "social", label: "Social" },
  { value: "ad", label: "Ad" },
  { value: "walk_in", label: "Walk-in" },
  { value: "embedded_form", label: "Embedded form" },
  { value: "other", label: "Other" },
];

export function AddLeadModal({ stages, members, currentUserId }: AddLeadModalProps) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<LeadFormState, FormData>(createLead, {});

  // Close on success: derive from state during render.
  const showOpen = open && !state.ok;

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        + Add lead
      </Button>

      <Modal open={showOpen} onClose={() => setOpen(false)} title="Add a lead" sub="Capture the details while they're fresh.">
        <form action={action} className="space-y-4">
          <div>
            <Label>Name *</Label>
            <Input name="name" placeholder="Adaeze Okonkwo" />
            {state.errors?.name && <p className="text-xs text-stamp mt-1">{state.errors.name[0]}</p>}
          </div>
          <div>
            <Label>Company</Label>
            <Input name="company" placeholder="Lagos Freight Co." />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Email</Label>
              <Input name="email" type="email" placeholder="ada@lagosfreight.com" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input name="phone" placeholder="+234 ..." />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Source *</Label>
              <Select name="source" defaultValue="referral">
                {SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
              {state.errors?.source && <p className="text-xs text-stamp mt-1">{state.errors.source[0]}</p>}
            </div>
            <div>
              <Label>Campaign</Label>
              <Input name="campaign" placeholder="Q3 freight push" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Stage</Label>
              <Select name="stageId" defaultValue="">
                <option value="">First open stage</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Assignee</Label>
              <Select name="assigneeId" defaultValue={currentUserId}>
                <option value={currentUserId}>Myself</option>
                {members
                  .filter((m) => m.userId !== currentUserId)
                  .map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name}
                    </option>
                  ))}
              </Select>
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea name="notes" rows={2} placeholder="Initial context, what they're looking for..." />
          </div>

          {/* Deal value + expected close date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Deal value (₦)</Label>
              <Input name="value" type="number" placeholder="500000" />
            </div>
            <div>
              <Label>Expected close date</Label>
              <Input name="expectedCloseDate" type="date" />
            </div>
          </div>

          {/* Duplicate warning re-submit hidden field */}
          {state.errors?.duplicate && (
            <input type="hidden" name="forceCreate" value="true" />
          )}

          {state.message && (
            <p className="text-sm text-stamp bg-stamp/10 px-3 py-2 rounded">{state.message}</p>
          )}

          <div className="flex justify-end gap-2.5 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Add lead"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
