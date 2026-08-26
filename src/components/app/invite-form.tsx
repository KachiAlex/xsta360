"use client";

import { useActionState } from "react";
import { inviteMember, type TeamFormState } from "@/app/actions/team";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";

export function InviteForm() {
  const [state, action, pending] = useActionState<TeamFormState, FormData>(inviteMember, {});

  return (
    <form action={action} className="flex gap-2 items-end flex-wrap">
      <div>
        <Label>Email</Label>
        <Input name="email" type="email" placeholder="teammate@company.com" className="w-auto" />
        {state.errors?.email && <p className="text-xs text-stamp mt-1">{state.errors.email[0]}</p>}
      </div>
      <div>
        <Label>Role</Label>
        <Select name="role" defaultValue="rep" className="w-auto">
          <option value="rep">Rep</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
        </Select>
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Sending…" : "Invite"}
      </Button>
      {state.message && (
        <p className={`text-xs ${state.ok ? "text-register" : "text-stamp"} w-full`}>{state.message}</p>
      )}
    </form>
  );
}
