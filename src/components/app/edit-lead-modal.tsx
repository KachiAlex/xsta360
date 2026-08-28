"use client";

import { useActionState, useEffect, useState } from "react";
import { updateLead, type LeadFormState } from "@/app/actions/leads";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/field";

export interface EditLeadModalProps {
  lead: {
    id: string;
    name: string;
    company: string | null;
    email: string | null;
    phone: string | null;
    source: string;
    campaign: string | null;
    notes: string | null;
    stageId: string | null;
    assigneeId: string | null;
    value: string | null;
    expectedCloseDate: Date | null;
  };
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

function toDateInput(d: Date | null): string {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function EditLeadModal({ lead, stages, members, currentUserId }: EditLeadModalProps) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<LeadFormState, FormData>(updateLead, {});

  const showOpen = open;
  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state.ok]);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
        className="min-h-[40px]"
        aria-label="Edit lead"
      >
        <span className="hidden sm:inline">Edit</span>
        <span className="sm:hidden">✎</span>
      </Button>

      <Modal open={showOpen} onClose={() => setOpen(false)} title="Edit lead" sub="Update the lead details.">
        <form action={action} className="space-y-4">
          <input type="hidden" name="leadId" value={lead.id} />
          <div>
            <Label>Name *</Label>
            <Input name="name" defaultValue={lead.name} placeholder="Adaeze Okonkwo" />
            {state.errors?.name && <p className="text-xs text-stamp mt-1">{state.errors.name[0]}</p>}
          </div>
          <div>
            <Label>Company</Label>
            <Input name="company" defaultValue={lead.company ?? ""} placeholder="Lagos Freight Co." />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Email</Label>
              <Input name="email" type="email" defaultValue={lead.email ?? ""} placeholder="ada@lagosfreight.com" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input name="phone" defaultValue={lead.phone ?? ""} placeholder="+234 ..." />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Source *</Label>
              <Select name="source" defaultValue={lead.source}>
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
              <Input name="campaign" defaultValue={lead.campaign ?? ""} placeholder="Q3 freight push" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Stage</Label>
              <Select name="stageId" defaultValue={lead.stageId ?? ""}>
                <option value="">— No stage —</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Assignee</Label>
              <Select name="assigneeId" defaultValue={lead.assigneeId ?? ""}>
                <option value="">Unassigned</option>
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
            <Textarea name="notes" rows={2} defaultValue={lead.notes ?? ""} placeholder="Initial context, what they're looking for..." />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Deal value (₦)</Label>
              <Input name="value" type="number" defaultValue={lead.value ?? ""} placeholder="500000" />
            </div>
            <div>
              <Label>Expected close date</Label>
              <Input name="expectedCloseDate" type="date" defaultValue={toDateInput(lead.expectedCloseDate)} />
            </div>
          </div>

          {state.message && (
            <p className="text-sm text-stamp bg-stamp/10 px-3 py-2 rounded" role="alert">{state.message}</p>
          )}

          <div className="flex justify-end gap-2.5 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
