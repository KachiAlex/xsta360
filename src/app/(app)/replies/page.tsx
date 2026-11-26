import Link from "next/link";
import { requireAuth } from "@/lib/dal";
import { getOrgReplies } from "@/lib/replies";
import { Topbar } from "@/components/app/topbar";
import { Panel, PanelHead } from "@/components/ui/panel";

export const dynamic = "force-dynamic";

function formatWhen(d: Date) {
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function RepliesPage() {
  const ctx = await requireAuth();
  const replies = await getOrgReplies(ctx.orgId);

  return (
    <>
      <Topbar />
      <main className="max-w-[1240px] w-full mx-auto px-5 sm:px-8 py-6 sm:py-8">
        <Panel>
          <PanelHead
            title="Replies"
            sub="Inbound WhatsApp messages from your leads — reply-to conversations pause automation automatically"
          />
          {replies.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-ink-soft">
              No inbound messages yet. When a lead replies on WhatsApp, it shows
              up here — and any active sequence automation pauses for them.
            </div>
          ) : (
            <ul className="divide-y divide-dashed divide-rule">
              {replies.map((r) => (
                <li key={r.id} className="px-5 py-3.5 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <Link
                        href={`/leads/${r.leadId}`}
                        className="font-semibold text-sm text-ink hover:text-stamp"
                      >
                        {r.leadName}
                      </Link>
                      {r.leadPhone && (
                        <span className="font-mono text-[11px] text-ink-soft">
                          {r.leadPhone}
                        </span>
                      )}
                      {r.consentAction === "out" && (
                        <span className="font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-stamp/40 text-stamp">
                          opted out
                        </span>
                      )}
                      {r.consentAction === "in" && (
                        <span className="font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-register/40 text-register">
                          opted in
                        </span>
                      )}
                      {r.pausedEnrollments > 0 && (
                        <span className="font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-rule text-ink-soft">
                          paused {r.pausedEnrollments} seq
                        </span>
                      )}
                    </div>
                    <p className="m-0 mt-1 text-sm text-ink-soft leading-relaxed break-words">
                      {r.preview}
                    </p>
                  </div>
                  <time className="shrink-0 font-mono text-[11px] text-ink-soft pt-0.5">
                    {formatWhen(r.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </main>
    </>
  );
}
