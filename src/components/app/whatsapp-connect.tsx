"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { connectWhatsAppEmbedded, disconnectWhatsApp } from "@/app/actions/org";
import { Button } from "@/components/ui/button";

declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

const APP_ID = process.env.NEXT_PUBLIC_META_APP_ID ?? "";
const CONFIG_ID = process.env.NEXT_PUBLIC_META_CONFIG_ID ?? "";
const GRAPH_VERSION = "v21.0";

/** True when the server has Meta app credentials configured. */
export const embeddedSignupConfigured = Boolean(APP_ID && CONFIG_ID);

let sdkPromise: Promise<void> | null = null;
function loadFacebookSdk(): Promise<void> {
  if (window.FB) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB.init({
        appId: APP_ID,
        autoLogAppEvents: true,
        xfbml: false,
        version: GRAPH_VERSION,
      });
      resolve();
    };
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onerror = () => reject(new Error("Could not load the Facebook SDK"));
    document.body.appendChild(script);
  });
  return sdkPromise;
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
  const sessionInfoRef = useRef<{ phone_number_id?: string; waba_id?: string }>({});
  const cancelledRef = useRef(false);

  // Meta posts WA_EMBEDDED_SIGNUP message events during the flow —
  // capture the phone number + WABA ids, and cancel steps.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== "https://www.facebook.com" && event.origin !== "https://web.facebook.com") return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
        if (data.event === "FINISH" || data.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") {
          sessionInfoRef.current = data.data ?? {};
        } else if (data.event === "CANCEL") {
          cancelledRef.current = true;
        }
      } catch {
        // Non-JSON message — ignore.
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  async function connect() {
    setBusy(true);
    setError(null);
    sessionInfoRef.current = {};
    cancelledRef.current = false;
    try {
      await loadFacebookSdk();
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "Could not load Facebook");
      return;
    }
    window.FB.login(
      async (response: any) => {
        const code: string | undefined = response?.authResponse?.code;
        const { phone_number_id, waba_id } = sessionInfoRef.current;
        if (!code) {
          setBusy(false);
          setError(
            cancelledRef.current
              ? "Setup was cancelled before completion."
              : "Facebook did not return an authorization code. Please try again.",
          );
          return;
        }
        if (!phone_number_id || !waba_id) {
          setBusy(false);
          setError("WhatsApp setup did not complete — no phone number was selected.");
          return;
        }
        const result = await connectWhatsAppEmbedded(code, phone_number_id, waba_id);
        setBusy(false);
        if (result?.message) {
          setError(result.message);
        } else {
          router.refresh();
        }
      },
      {
        config_id: CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
      },
    );
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
    <div>
      <Button type="button" variant="ghost" size="sm" onClick={connect} disabled={busy}>
        {busy ? "Connecting…" : "Connect with Facebook"}
      </Button>
      <p className="text-xs text-ink-soft mt-1.5">
        One-click setup — Meta securely links your WhatsApp Business account to this workspace.
      </p>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}
