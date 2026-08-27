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
    <li className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 justify-between">
      <div>
        <span className="block font-medium">{email}</span>
        <span className="text-xs text-ink-soft">
          {role} · Expires {new Date(expiresAt).toLocaleDateString()}
        </span>
      </div>
      <form action={action} className="flex items-center gap-2">
        <input type="hidden" name="invitationId" value={id} />
        <Input
          value={inviteUrl}
          readOnly
          className="text-xs font-mono w-64 bg-paper-2"
          onClick={(e) => e.currentTarget.select()}
        />
        <Button type="button" size="sm" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button type="submit" size="sm" variant="ghost" className="text-stamp border-stamp" disabled={pending}>
          {pending ? "…" : "Revoke"}
        </Button>
      </form>
      {state?.message && (
        <p className={`text-xs ${state.ok ? "text-register" : "text-stamp"} w-full`}>
          {state.message}
        </p>
      )}
    </li>
  );
}
