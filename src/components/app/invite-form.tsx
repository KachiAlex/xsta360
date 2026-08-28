"use client";

import { useActionState, useState } from "react";
import { inviteMember, type TeamFormState } from "@/app/actions/team";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";

export function InviteForm() {
  const [state, action, pending] = useActionState<TeamFormState, FormData>(inviteMember, {});
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!state.inviteUrl) return;
    await navigator.clipboard.writeText(state.inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <form action={action} className="flex flex-col sm:flex-row gap-2 sm:gap-2 sm:items-end sm:flex-wrap">
      <div className="flex-1 min-w-0 sm:min-w-[180px]">
        <Label>Email</Label>
        <Input name="email" type="email" placeholder="teammate@company.com" />
        {state.errors?.email && (
          <p className="text-xs text-stamp mt-1">{state.errors.email[0]}</p>
        )}
      </div>
      <div className="min-w-0 sm:min-w-[120px]">
        <Label>Role</Label>
        <Select name="role" defaultValue="rep">
          <option value="rep">Rep</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
        </Select>
      </div>
      <Button type="submit" size="sm" disabled={pending} className="sm:self-end">
        {pending ? "Creating…" : "Invite"}
      </Button>

      {state.message && (
        <p className={`text-xs ${state.ok ? "text-register" : "text-stamp"} w-full`}>
          {state.message}
        </p>
      )}

      {state.inviteUrl && (
        <div className="w-full flex items-center gap-2 mt-2">
          <Input
            value={state.inviteUrl}
            readOnly
            className="text-sm bg-paper-2 font-mono"
            onClick={(e) => e.currentTarget.select()}
          />
          <Button type="button" size="sm" onClick={copy}>
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      )}
    </form>
  );
}
