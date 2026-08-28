"use client";

import { useActionState, useState } from "react";
import { revokeInvite, type TeamFormState } from "@/app/actions/team";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

interface InvitationRowProps {
  id: string;
  email: string;
  role: string;
  inviteUrl: string;
  expiresAt: Date;
}

export function InvitationRow({ id, email, role, inviteUrl, expiresAt }: InvitationRowProps) {
  const [state, action, pending] = useActionState<TeamFormState, FormData>(revokeInvite, {});
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <li className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-4 justify-between py-1">
      <div>
        <span className="block font-medium text-sm">{email}</span>
        <span className="text-xs text-ink-soft">
          {role} · Expires {new Date(expiresAt).toLocaleDateString()}
        </span>
      </div>
      <form action={action} className="flex items-center gap-2 flex-wrap">
        <input type="hidden" name="invitationId" value={id} />
        <Input
          value={inviteUrl}
          readOnly
          className="text-xs font-mono w-full sm:w-64 bg-paper-2 min-h-[40px]"
          onClick={(e) => e.currentTarget.select()}
        />
        <div className="flex gap-2 w-full sm:w-auto">
          <Button type="button" size="sm" onClick={copy} className="flex-1 sm:flex-none">
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button type="submit" size="sm" variant="ghost" className="text-stamp border-stamp flex-1 sm:flex-none" disabled={pending}>
            {pending ? "…" : "Revoke"}
          </Button>
        </div>
      </form>
      {state?.message && (
        <p className={`text-xs ${state.ok ? "text-register" : "text-stamp"} w-full`}>
          {state.message}
        </p>
      )}
    </li>
  );
}
