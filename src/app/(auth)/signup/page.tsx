"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signup, type AuthFormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";

export default function SignupPage() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signup, {});

  return (
    <div className="w-full max-w-sm">
      <h1 className="font-mono text-2xl mb-1">Start free</h1>
      <p className="text-ink-soft text-sm mb-6">
        Set up your workspace in under a minute. No card needed.
      </p>

      <form action={action} className="space-y-4">
        <div>
          <Label>Your name</Label>
          <Input name="name" placeholder="Tunde Bakare" autoComplete="name" />
          {state.errors?.name && (
            <p className="text-xs text-stamp mt-1">{state.errors.name[0]}</p>
          )}
        </div>
        <div>
          <Label>Organization name</Label>
          <Input name="orgName" placeholder="Kreatix Technologies" />
          {state.errors?.orgName && (
            <p className="text-xs text-stamp mt-1">{state.errors.orgName[0]}</p>
          )}
        </div>
        <div>
          <Label>Work email</Label>
          <Input name="email" type="email" placeholder="you@company.com" autoComplete="email" />
          {state.errors?.email && (
            <p className="text-xs text-stamp mt-1">{state.errors.email[0]}</p>
          )}
        </div>
        <div>
          <Label>Password</Label>
          <Input name="password" type="password" autoComplete="new-password" />
          <p className="text-xs text-ink-soft mt-1">Min 8 chars, with a letter and a number.</p>
          {state.errors?.password && (
            <p className="text-xs text-stamp mt-1">{state.errors.password[0]}</p>
          )}
        </div>

        {state.message && (
          <p className="text-sm text-stamp bg-stamp/10 px-3 py-2 rounded">{state.message}</p>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Creating workspace…" : "Create workspace"}
        </Button>
      </form>

      <p className="text-sm text-ink-soft mt-6 text-center">
        Already have an account?{" "}
        <Link href="/login" className="text-ink font-semibold underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </div>
  );
}
