"use client";

import { useActionState } from "react";
import { signin, signupAndJoin, type AuthFormState } from "@/app/actions/auth";
import { acceptInvite, type TeamFormState } from "@/app/actions/team";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";

interface JoinViewProps {
  token: string;
  email: string;
  role: string;
  orgName: string;
  hasSession: boolean;
}

export function JoinView({ token, email, role, orgName, hasSession }: JoinViewProps) {
  const [signinState, signinAction, signinPending] = useActionState<AuthFormState, FormData>(
    signin,
    {},
  );
  const [signupState, signupAction, signupPending] = useActionState<AuthFormState, FormData>(
    signupAndJoin,
    {},
  );
  const [acceptState, acceptAction, acceptPending] = useActionState<TeamFormState, FormData>(
    acceptInvite,
    {},
  );

  if (hasSession) {
    return (
      <div className="w-full max-w-sm">
        <h1 className="font-mono text-2xl mb-1">Join {orgName}</h1>
        <p className="text-ink-soft text-sm mb-6">
          You have been invited as <strong>{role}</strong> using {email}.
        </p>
        <form action={acceptAction} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          {acceptState?.message && (
            <p className="text-sm text-stamp bg-stamp/10 px-3 py-2 rounded">
              {acceptState.message}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={acceptPending}>
            {acceptPending ? "Joining…" : "Accept invitation"}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl">
      <h1 className="font-mono text-2xl mb-1">Join {orgName}</h1>
      <p className="text-ink-soft text-sm mb-6">
        You have been invited as <strong>{role}</strong>. This invite is for{" "}
        <strong>{email}</strong>.
      </p>

      <div className="grid gap-8 md:grid-cols-2">
        <section>
          <h2 className="font-mono text-lg mb-4">Already have an account?</h2>
          <form action={signinAction} className="space-y-4">
            <input type="hidden" name="next" value={`/join/${token}`} />
            <div>
              <Label>Email</Label>
              <Input name="email" type="email" defaultValue={email} readOnly />
            </div>
            <div>
              <Label>Password</Label>
              <Input name="password" type="password" autoComplete="current-password" />
            </div>
            {signinState?.message && (
              <p className="text-sm text-stamp bg-stamp/10 px-3 py-2 rounded">
                {signinState.message}
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={signinPending}>
              {signinPending ? "Signing in…" : "Sign in & join"}
            </Button>
          </form>
        </section>

        <section>
          <h2 className="font-mono text-lg mb-4">Create an account</h2>
          <form action={signupAction} className="space-y-4">
            <input type="hidden" name="token" value={token} />
            <div>
              <Label>Full name</Label>
              <Input name="name" placeholder="Your name" autoComplete="name" />
              {signupState?.errors?.name && (
                <p className="text-xs text-stamp mt-1">{signupState.errors.name[0]}</p>
              )}
            </div>
            <div>
              <Label>Email</Label>
              <Input value={email} readOnly className="bg-paper-2 text-ink-soft" />
            </div>
            <div>
              <Label>Password</Label>
              <Input name="password" type="password" autoComplete="new-password" />
              <p className="text-xs text-ink-soft mt-1">
                Min 8 chars, with a letter and a number.
              </p>
              {signupState?.errors?.password && (
                <p className="text-xs text-stamp mt-1">{signupState.errors.password[0]}</p>
              )}
            </div>
            {signupState?.message && (
              <p className="text-sm text-stamp bg-stamp/10 px-3 py-2 rounded">
                {signupState.message}
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={signupPending}>
              {signupPending ? "Creating account…" : "Create account & join"}
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}
