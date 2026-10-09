"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  disconnectWhatsApp,
  listPendingWhatsAppAccounts,
  completeHostedWhatsAppConnect,
} from "@/app/actions/org";
import { Button } from "@/components/ui/button";

const APP_ID = process.env.NEXT_PUBLIC_META_APP_ID ?? "";
const CONFIG_ID = process.env.NEXT_PUBLIC_META_CONFIG_ID ?? "";

/** True when the server has Meta app credentials configured. */
export const embeddedSignupConfigured = Boolean(APP_ID && CONFIG_ID);

// Meta's hosted ("zero integration") embedded signup page — no JS SDK needed.
// featureType whatsapp_business_app_onboarding lets clients onboard a number
// that already runs the WhatsApp Business app (coexistence) without disconnecting it.
const ONBOARD_URL =
  `https://business.facebook.com/messaging/whatsapp/onboard/` +
  `?app_id=${APP_ID}&config_id=${CONFIG_ID}` +
  `&extras=${encodeURIComponent(
    JSON.stringify({ version: "v4", sessionInfoVersion: "3", featureType: "whatsapp_business_app_onboarding" }),
  )}`;

interface PendingAccount {
  id: string;
  name?: string;
}

export function WhatsAppConnect({
  connected,
  phoneNumberId,
}: {
  connected: boolean;
  phoneNumberId?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [pending, setPending] = useState<PendingAccount[] | null>(null);

  function connect() {
    setError(null);
    setPending(null);
    setStarted(true);
    window.open(ONBOARD_URL, "_blank", "noopener,width=720,height=820");
  }

  async function complete(wabaId?: string) {
    setBusy(true);
    setError(null);
    try {
      if (!wabaId) {
        const list = await listPendingWhatsAppAccounts();
        if (!list.ok) {
          setError(list.message ?? "Could not check for connected accounts");
          return;
        }
        const accounts = list.accounts ?? [];
        if (accounts.length === 0) {
          setError(
            "No new WhatsApp account detected yet — finish the Meta steps in the other tab, then try again.",
          );
          return;
        }
        if (accounts.length > 1) {
          setPending(accounts);
          return;
        }
        wabaId = accounts[0].id;
      }

      const result = await completeHostedWhatsAppConnect(wabaId);
      if (result?.message) {
        setError(result.message);
      } else {
        setPending(null);
        setStarted(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect WhatsApp? Sequence steps and reminders will stop sending.")) return;
    setBusy(true);
    setError(null);
    const result = await disconnectWhatsApp();
    setBusy(false);
    if (result?.message) setError(result.message);
    else router.refresh();
  }

  if (connected) {
    return (
      <div className="flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-won">
          <span className="inline-block h-2 w-2 rounded-full bg-won" />
          Connected
        </span>
        <span className="text-xs text-ink-soft font-mono">Phone ID: {phoneNumberId}</span>
        <Button type="button" variant="ghost" size="sm" onClick={disconnect} disabled={busy}>
          {busy ? "Disconnecting…" : "Disconnect"}
        </Button>
        {error && <p className="text-xs text-red-600 w-full">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <Button type="button" variant="ghost" size="sm" onClick={connect} disabled={busy}>
          Connect with Facebook
        </Button>
        {started && (
          <Button type="button" variant="primary" size="sm" onClick={() => complete()} disabled={busy}>
            {busy ? "Linking…" : "Finish connection"}
          </Button>
        )}
      </div>
      <p className="text-xs text-ink-soft">
        One-click setup — Meta securely links your WhatsApp Business account to this workspace.
        You can keep using the WhatsApp Business app on your phone.
      </p>
      {started && !pending && (
        <p className="text-[11px] text-ink-soft">
          A Meta tab just opened — complete the steps there, then come back and click
          &quot;Finish connection&quot;.
        </p>
      )}
      {pending && (
        <div className="rounded border border-rule bg-paper-2 p-3 space-y-2">
          <p className="text-xs font-medium">Which WhatsApp account is yours?</p>
          {pending.map((a) => (
            <button
              key={a.id}
              type="button"
              disabled={busy}
              onClick={() => complete(a.id)}
              className="block w-full text-left text-xs px-3 py-2 rounded border border-rule bg-paper hover:border-stamp transition-colors"
            >
              <span className="font-semibold">{a.name || "WhatsApp Business Account"}</span>
              <span className="text-ink-soft font-mono ml-2">{a.id}</span>
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
