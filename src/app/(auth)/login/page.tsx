"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { signin, type AuthFormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";

function LoginForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signin, {});
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";

  return (
    <div className="w-full max-w-sm">
      <h1 className="font-mono text-2xl mb-1">Welcome back</h1>
      <p className="text-ink-soft text-sm mb-6">Sign in to your Xsta360 workspace.</p>

      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <div>
          <Label>Email</Label>
          <Input name="email" type="email" placeholder="you@company.com" autoComplete="email" />
          {state.errors?.email && (
            <p className="text-xs text-stamp mt-1">{state.errors.email[0]}</p>
          )}
        </div>
        <div>
          <Label>Password</Label>
          <Input name="password" type="password" autoComplete="current-password" />
          {state.errors?.password && (
            <p className="text-xs text-stamp mt-1">{state.errors.password[0]}</p>
          )}
        </div>

        {state.message && (
          <p className="text-sm text-stamp bg-stamp/10 px-3 py-2 rounded" role="alert">{state.message}</p>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="text-sm text-ink-soft mt-6 text-center">
        No account yet?{" "}
        <Link href="/signup" className="text-ink font-semibold underline underline-offset-2">
          Start free
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="w-full max-w-sm"><p className="text-ink-soft text-sm">Loading...</p></div>}>
      <LoginForm />
    </Suspense>
  );
}
