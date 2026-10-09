"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
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

function Step({ n, title, detail, active, done }: {
  n: number;
  title: string;
  detail?: string;
  active?: boolean;
  done?: boolean;
}) {
  return (
    <div className="flex gap-2.5">
      <span
        className={`mt-0.5 inline-flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
          done ? "bg-won text-white" : active ? "bg-stamp text-white" : "bg-rule text-ink-soft"
        }`}
      >
        {done ? "✓" : n}
      </span>
      <div>
        <p className={`text-xs ${active ? "font-semibold text-ink" : "text-ink-soft"}`}>{title}</p>
        {detail && <p className="text-[11px] text-ink-soft mt-0.5">{detail}</p>}
      </div>
    </div>
  );
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
    // Facebook blocks OAuth inside embedded webviews — on the mobile app the
    // Meta flow must open in the system browser (Chrome Custom Tab).
    if (Capacitor.isNativePlatform()) {
      Browser.open({ url: ONBOARD_URL });
    } else {
      window.open(ONBOARD_URL, "_blank", "noopener,width=720,height=820");
    }
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
            "No new WhatsApp account detected yet. Make sure you finished every step in the Meta tab — including verifying your phone number — then try again.",
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
      <div className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-won">
            <span className="inline-block h-2 w-2 rounded-full bg-won" />
            Connected
          </span>
          <span className="text-xs text-ink-soft font-mono">Phone ID: {phoneNumberId}</span>
          <Button type="button" variant="ghost" size="sm" onClick={disconnect} disabled={busy}>
            {busy ? "Disconnecting…" : "Disconnect"}
          </Button>
        </div>
        <p className="text-[11px] text-ink-soft">
          Sequence messages go out as Meta-approved templates, billed per message to your WhatsApp
          account. If sends aren&apos;t delivering, add a payment method in{" "}
          <a
            href="https://business.facebook.com/wa/manage/home/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-stamp underline underline-offset-2"
          >
            WhatsApp Manager
          </a>{" "}
          → Account tools → Payment.
        </p>
        {error && <p className="text-xs text-red-600 w-full">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded border border-rule bg-paper-2/50 p-3 space-y-3">
      {!started && (
        <>
          <div>
            <p className="text-xs font-semibold">Connect your WhatsApp Business number</p>
            <p className="text-[11px] text-ink-soft mt-0.5">
              Takes about 2 minutes. Meta handles the setup securely — there&apos;s nothing to copy or configure yourself.
            </p>
          </div>
          <div className="text-[11px] text-ink-soft space-y-1">
            <p className="font-medium text-ink">Before you start, have ready:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Your <strong>Facebook login</strong> for your business</li>
              <li>
                The phone that runs your <strong>WhatsApp Business app</strong> — you can keep using it
                after connecting. <em>Or</em> a number that isn&apos;t on WhatsApp at all.
              </li>
              <li>
                A <strong>payment method</strong> on your WhatsApp account — Meta requires one before it
                delivers outreach messages (billed per message, a few kobo each). You can add it after
                connecting in WhatsApp Manager.
              </li>
            </ul>
          </div>
          <Button type="button" variant="primary" size="sm" onClick={connect} disabled={busy}>
            Connect with Facebook
          </Button>
        </>
      )}

      {started && (
        <div className="space-y-2.5">
          <Step n={1} title="Connect with Facebook" detail="Done — the Meta tab opened." done />
          <Step
            n={2}
            title="Complete Meta's setup in the new tab"
            detail="Sign in → choose your own business → connect your number (scan the QR code or use the access code with your WhatsApp Business app) → verify."
            active
          />
          <Step n={3} title="Come back here and finish" detail="We'll link the account you just set up." />
          <Button type="button" variant="primary" size="sm" onClick={() => complete()} disabled={busy}>
            {busy ? "Linking…" : "Finish connection"}
          </Button>
          <p className="text-[11px] text-ink-soft">
            Tip: if Meta asks which business to use, pick <strong>your own</strong> business portfolio.
          </p>
        </div>
      )}

      {pending && (
        <div className="rounded border border-rule bg-paper p-3 space-y-2">
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
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
