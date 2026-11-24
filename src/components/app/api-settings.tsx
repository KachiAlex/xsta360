"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import {
  createApiKey,
  revokeApiKey,
  createWebhook,
  setWebhookActive,
  deleteWebhook,
} from "@/app/actions/api-management";

const SCOPES = [
  { value: "contacts:write", label: "Contacts (write)" },
  { value: "messages:send", label: "Send messages" },
  { value: "sequences:enroll", label: "Enroll in sequences" },
  { value: "read", label: "Read status" },
];

const EVENTS = [
  { value: "message.sent", label: "Message sent" },
  { value: "message.delivered", label: "Message delivered" },
  { value: "message.read", label: "Message read" },
  { value: "message.failed", label: "Message failed" },
  { value: "contact.replied", label: "Contact replied" },
  { value: "contact.opted_out", label: "Contact opted out" },
];

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | Date | null;
  createdAt: string | Date;
}

export interface WebhookRow {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  lastDeliveredAt: string | Date | null;
  lastError: string | null;
}

export function ApiSettings({
  apiAccessEnabled,
  keys,
  webhooks,
  baseUrl,
}: {
  apiAccessEnabled: boolean;
  keys: ApiKeyRow[];
  webhooks: WebhookRow[];
  baseUrl: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function copy(text: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function submitKey(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const scopes = SCOPES.map((s) => s.value).filter((s) => fd.get(`scope_${s}`));
    setError(null);
    startTransition(async () => {
      const res = await createApiKey({ name: String(fd.get("name") ?? ""), scopes });
      if (res.ok) setNewKey(res.key!);
      else setError(res.error ?? "Failed to create key");
    });
    e.currentTarget.reset();
  }

  function submitWebhook(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const events = EVENTS.map((ev) => ev.value).filter((v) => fd.get(`event_${v}`));
    setError(null);
    startTransition(async () => {
      const res = await createWebhook({ url: String(fd.get("url") ?? ""), events });
      if (res.ok) setNewSecret(res.secret!);
      else setError(res.error ?? "Failed to add webhook");
    });
    e.currentTarget.reset();
  }

  return (
    <div className="px-5 py-4 space-y-5">
      {!apiAccessEnabled && (
        <p className="text-xs text-ink-soft bg-paper-2 border border-rule rounded px-3 py-2">
          API access isn&apos;t enabled on your plan. Keys can be created now but
          requests will be rejected until you upgrade — contact support or pick a
          plan with API access.
        </p>
      )}

      <p className="text-xs text-ink-soft">
        Base URL: <code className="font-mono bg-paper-2 px-1.5 py-0.5 rounded">{baseUrl}/api/v1</code>
        {" · "}Auth: <code className="font-mono bg-paper-2 px-1.5 py-0.5 rounded">Authorization: Bearer xsta_live_…</code>
      </p>

      {error && <p className="text-xs text-stamp">{error}</p>}

      {/* One-time secret reveals */}
      {newKey && (
        <div className="border border-rule rounded bg-paper-2 px-3 py-2.5 text-xs">
          <span className="font-semibold">New API key — copy it now, it won&apos;t be shown again:</span>
          <div className="flex items-center gap-2 mt-1.5">
            <code className="font-mono break-all flex-1">{newKey}</code>
            <Button size="sm" variant="ghost" onClick={() => copy(newKey)}>{copied ? "Copied" : "Copy"}</Button>
          </div>
        </div>
      )}
      {newSecret && (
        <div className="border border-rule rounded bg-paper-2 px-3 py-2.5 text-xs">
          <span className="font-semibold">Webhook signing secret — copy it now:</span>
          <div className="flex items-center gap-2 mt-1.5">
            <code className="font-mono break-all flex-1">{newSecret}</code>
            <Button size="sm" variant="ghost" onClick={() => copy(newSecret)}>{copied ? "Copied" : "Copy"}</Button>
          </div>
        </div>
      )}

      {/* API keys */}
      <section>
        <h3 className="font-mono text-[11px] uppercase tracking-wider text-ink-soft mb-2">API keys</h3>
        {keys.length > 0 ? (
          <ul className="divide-y divide-dashed divide-rule border border-rule rounded mb-3">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{k.name}</div>
                  <div className="text-[11px] text-ink-soft font-mono truncate">
                    {k.prefix}… · {(k.scopes ?? []).join(", ")}
                    {k.lastUsedAt ? ` · last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : " · never used"}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => startTransition(async () => { await revokeApiKey(k.id); })}
                  className="text-xs text-stamp hover:underline disabled:opacity-50"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-soft mb-3">No keys yet.</p>
        )}

        <form onSubmit={submitKey} className="border border-rule rounded p-3 space-y-2.5 bg-paper-2/50">
          <Label>New key</Label>
          <Input name="name" placeholder="e.g. WooCommerce store" required maxLength={80} />
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {SCOPES.map((s) => (
              <label key={s.value} className="flex items-center gap-1.5 text-xs text-ink">
                <input type="checkbox" name={`scope_${s.value}`} className="accent-ink" /> {s.label}
              </label>
            ))}
          </div>
          <Button type="submit" size="sm" disabled={pending}>{pending ? "Creating…" : "Create key"}</Button>
        </form>
      </section>

      {/* Webhooks */}
      <section>
        <h3 className="font-mono text-[11px] uppercase tracking-wider text-ink-soft mb-2">Outbound webhooks</h3>
        <p className="text-[11px] text-ink-soft mb-2">
          We POST signed events to your endpoint. Verify <code className="font-mono">x-xsta-signature</code> with your secret.
        </p>
        {webhooks.length > 0 ? (
          <ul className="divide-y divide-dashed divide-rule border border-rule rounded mb-3">
            {webhooks.map((w) => (
              <li key={w.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs truncate">{w.url}</div>
                  <div className="text-[11px] text-ink-soft">
                    {(w.events ?? []).join(", ")}
                    {w.lastError && <span className="text-stamp"> · last error: {w.lastError}</span>}
                    {w.lastDeliveredAt && ` · last delivered ${new Date(w.lastDeliveredAt).toLocaleString()}`}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => startTransition(async () => { await setWebhookActive(w.id, !w.active); })}
                  className="text-xs text-ink-soft hover:text-ink disabled:opacity-50"
                >
                  {w.active ? "Disable" : "Enable"}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => startTransition(async () => { await deleteWebhook(w.id); })}
                  className="text-xs text-stamp hover:underline disabled:opacity-50"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-soft mb-3">No webhooks yet.</p>
        )}

        <form onSubmit={submitWebhook} className="border border-rule rounded p-3 space-y-2.5 bg-paper-2/50">
          <Label>New webhook</Label>
          <Input name="url" type="url" placeholder="https://yourapp.com/xsta-webhook" required />
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {EVENTS.map((ev) => (
              <label key={ev.value} className="flex items-center gap-1.5 text-xs text-ink">
                <input type="checkbox" name={`event_${ev.value}`} className="accent-ink" /> {ev.label}
              </label>
            ))}
          </div>
          <Button type="submit" size="sm" disabled={pending}>{pending ? "Adding…" : "Add webhook"}</Button>
        </form>
      </section>
    </div>
  );
}
