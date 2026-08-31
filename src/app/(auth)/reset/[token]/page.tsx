"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { resetPassword } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";

export default function ResetPasswordPage() {
  const params = useParams();
  const token = typeof params.token === "string" ? params.token : "";
  const [state, action, pending] = useActionState(resetPassword, {});

  return (
    <div className="w-full max-w-sm">
      <h1 className="font-mono text-2xl mb-1">Set new password</h1>
      <p className="text-ink-soft text-sm mb-6">
        Choose a new password for your account.
      </p>

      <form action={action} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <div>
          <Label>New password</Label>
          <Input name="password" type="password" autoComplete="new-password" />
          <p className="text-xs text-ink-soft mt-1">Min 8 chars, with a letter and a number.</p>
          {state.errors?.password && (
            <p className="text-xs text-stamp mt-1">{state.errors.password[0]}</p>
          )}
        </div>

        {state.message && (
          <p className="text-sm text-stamp bg-stamp/10 px-3 py-2 rounded" role="alert">
            {state.message}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Saving…" : "Reset password"}
        </Button>
      </form>

      <p className="text-sm text-ink-soft mt-6 text-center">
        <Link href="/login" className="text-ink font-semibold underline underline-offset-2">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
