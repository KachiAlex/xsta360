import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentPayload } from "@/lib/session";
import { JoinView } from "@/components/app/join-view";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const [invite] = await db
    .select({
      email: schema.invitations.email,
      role: schema.invitations.role,
      orgId: schema.invitations.orgId,
      acceptedAt: schema.invitations.acceptedAt,
      expiresAt: schema.invitations.expiresAt,
    })
    .from(schema.invitations)
    .where(eq(schema.invitations.token, token))
    .limit(1);

  if (!invite) notFound();

  if (invite.acceptedAt) {
    return <ErrorMessage>This invitation has already been used.</ErrorMessage>;
  }

  if (invite.expiresAt < new Date()) {
    return <ErrorMessage>This invitation has expired.</ErrorMessage>;
  }

  const [org] = await db
    .select({ name: schema.organizations.name })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, invite.orgId))
    .limit(1);

  if (!org) notFound();

  const session = await getCurrentPayload();

  return (
    <JoinView
      token={token}
      email={invite.email}
      role={invite.role}
      orgName={org.name}
      hasSession={!!session}
    />
  );
}

function ErrorMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-sm text-center">
      <h1 className="font-mono text-2xl mb-2">Invitation unavailable</h1>
      <p className="text-ink-soft">{children}</p>
    </div>
  );
}
