"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestPasswordReset, {});

  return (
    <div className="w-full max-w-sm">
      <h1 className="font-mono text-2xl mb-1">Reset password</h1>
      <p className="text-ink-soft text-sm mb-6">
        Enter your email and we'll send you a link to reset your password.
      </p>

      <form action={action} className="space-y-4">
        <div>
          <Label>Email</Label>
          <Input name="email" type="email" placeholder="you@company.com" autoComplete="email" />
          {state.errors?.email && (
            <p className="text-xs text-stamp mt-1">{state.errors.email[0]}</p>
          )}
        </div>

        {state.message && (
          <p className="text-sm text-ink-soft bg-paper-2 px-3 py-2 rounded" role="alert">
            {state.message}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Sending…" : "Send reset link"}
        </Button>
      </form>

      <p className="text-sm text-ink-soft mt-6 text-center">
        Remember your password?{" "}
        <Link href="/login" className="text-ink font-semibold underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </div>
  );
}
