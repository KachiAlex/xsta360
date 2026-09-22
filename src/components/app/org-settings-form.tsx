"use client";

import { useActionState, useState } from "react";
import { updateOrgSettings, type OrgFormState } from "@/app/actions/org";
import { Button } from "@/components/ui/button";
import { Label, Input, Textarea } from "@/components/ui/field";
import { WhatsAppConnect, embeddedSignupConfigured } from "@/components/app/whatsapp-connect";
import { WhatsAppTemplates } from "@/components/app/whatsapp-templates";
import { EmailDomain } from "@/components/app/email-domain";

interface CustomFieldDef {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "date";
  options?: string[];
}

export function OrgSettingsForm({
  currency,
  replyToEmail,
  whatsappConfig,
  customFieldDefs,
  emailDomain,
  emailDomainStatus,
  emailDomainRecords,
  emailFromAddress,
  emailDomainEnabled,
}: {
  currency: string;
  replyToEmail: string | null;
  whatsappConfig: { enabled?: boolean; phoneNumberId?: string; apiKey?: string; wabaId?: string } | null;
  customFieldDefs: CustomFieldDef[];
  emailDomain: string | null;
  emailDomainStatus: string | null;
  emailDomainRecords: Record<string, { host_name: string; type: string; value: string; status: boolean }> | null;
  emailFromAddress: string | null;
  emailDomainEnabled: boolean;
}) {
  const [state, action, pending] = useActionState<OrgFormState, FormData>(updateOrgSettings, {});
  const [fields, setFields] = useState<CustomFieldDef[]>(customFieldDefs || []);
  const [whatsappEnabled, setWhatsappEnabled] = useState(whatsappConfig?.enabled ?? false);

  function addField() {
    setFields([...fields, { key: `field_${Date.now()}`, label: "", type: "text" }]);
  }

  function removeField(idx: number) {
    setFields(fields.filter((_, i) => i !== idx));
  }

  function updateField(idx: number, key: keyof CustomFieldDef, value: string) {
    setFields(fields.map((f, i) => (i === idx ? { ...f, [key]: value } : f)));
  }

  return (
    <form action={action} className="p-5 space-y-6">
      {/* Currency */}
      <div>
        <Label>Currency symbol</Label>
        <Input name="currency" defaultValue={currency} placeholder="₦" className="max-w-[100px]" />
      </div>

      {/* Reply-to email for sequence emails */}
      <div>
        <Label>Reply-to email (for sequence emails)</Label>
        <Input name="replyToEmail" type="email" defaultValue={replyToEmail ?? ""} placeholder="replies@yourcompany.com" className="max-w-sm" />
        <p className="text-xs text-ink-soft mt-1">When leads reply to automated sequence emails, their reply goes to this address. Use a shared inbox if multiple reps should see replies.</p>
        <EmailDomain
          enabled={emailDomainEnabled}
          domain={emailDomain}
          status={emailDomainStatus}
          records={emailDomainRecords}
          fromAddress={emailFromAddress}
        />
      </div>

      {/* WhatsApp config */}
      <div className="border-t border-rule pt-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="block text-xs font-semibold mb-1.5 text-ink-soft">WhatsApp Business</span>
          {whatsappConfig?.enabled && whatsappConfig?.phoneNumberId && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-won">
              <span className="inline-block h-2 w-2 rounded-full bg-won" />
              Connected
            </span>
          )}
        </div>

        {/* One-click embedded signup — primary path when Meta app env is configured. */}
        {embeddedSignupConfigured && (
          <div className="mb-3">
            <WhatsAppConnect
              connected={Boolean(whatsappConfig?.enabled && whatsappConfig?.phoneNumberId)}
              phoneNumberId={whatsappConfig?.phoneNumberId}
            />
          </div>
        )}

        {/* Notice when one-click connect isn't live yet (pending Meta approval). */}
        {!embeddedSignupConfigured && (
          <p className="mb-3 text-[11px] text-ink-soft bg-paper-2 border border-rule rounded px-3 py-2">
            ⏳ One-click WhatsApp connect is coming soon (pending Meta approval) — use manual setup
            below for now; it works today.
          </p>
        )}

        {/* Manual setup — fallback when embedded signup isn't configured or fails. */}
        <details className="rounded border border-rule bg-paper/60 text-xs">
          <summary className="cursor-pointer px-3 py-2 font-medium text-ink-soft select-none">
            {embeddedSignupConfigured ? "Manual setup (advanced)" : "Set up WhatsApp Business"}
          </summary>
          <div className="px-3 pb-3 pt-2 border-t border-rule space-y-3">
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={whatsappEnabled}
                onChange={(e) => setWhatsappEnabled(e.target.checked)}
              />
              Enable WhatsApp
            </label>
            <details className="rounded border border-rule bg-paper text-xs">
              <summary className="cursor-pointer px-3 py-2 font-medium text-ink-soft select-none">
                How do I get these credentials? (setup guide)
              </summary>
              <ol className="list-decimal space-y-2 px-3 pb-3 pl-8 pt-1 text-ink-soft">
                <li>
                  Go to{" "}
                  <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer" className="text-stamp underline underline-offset-2">
                    developers.facebook.com/apps
                  </a>{" "}
                  → <strong>Create App</strong> → choose <strong>Business</strong> type → add the <strong>WhatsApp</strong> product.
                </li>
                <li>
                  In your app, open <strong>WhatsApp → API Setup</strong>. Under <strong>Send and receive messages</strong>, add your business phone number.
                </li>
                <li>
                  Copy the <strong>Phone Number ID</strong> shown under your number (it&apos;s a numeric ID, not the phone number), and the{" "}
                  <strong>WhatsApp Business Account ID</strong> shown in the account dropdown at the top of the same page.
                </li>
                <li>
                  For testing, copy the <strong>Temporary access token</strong> on the same page (expires in 24 hours).
                </li>
                <li>
                  For production, create a permanent token:{" "}
                  <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noopener noreferrer" className="text-stamp underline underline-offset-2">
                    business.facebook.com → System Users
                  </a>{" "}
                  → Add system user → Generate token → select your app → check <code>whatsapp_business_messaging</code> and <code>whatsapp_business_management</code>.
                </li>
                <li>Paste the three values here and save.</li>
              </ol>
              <p className="px-3 pb-3 text-[11px] leading-relaxed text-ink-soft/80 border-t border-rule pt-2">
                Note: Meta only lets you message leads who have contacted you in the last 24 hours
                unless you use a pre-approved message template (created in{" "}
                <a href="https://business.facebook.com/wa/manage/home/" target="_blank" rel="noopener noreferrer" className="text-stamp underline underline-offset-2">
                  WhatsApp Manager
                </a>
                ). Per-message fees apply for template messages.
              </p>
            </details>
            {whatsappEnabled && (
              <div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label>Phone Number ID</Label>
                    <Input name="whatsappPhoneNumberId" defaultValue={whatsappConfig?.phoneNumberId ?? ""} placeholder="e.g. 1249837834878071" />
                    {state.errors?.whatsappPhoneNumberId && (
                      <p className="text-xs text-stamp mt-1">{state.errors.whatsappPhoneNumberId[0]}</p>
                    )}
                    <p className="text-[11px] text-ink-soft mt-1">The numeric ID under your number in Meta's API Setup — not the phone number.</p>
                  </div>
                  <div>
                    <Label>WABA ID</Label>
                    <Input name="whatsappWabaId" defaultValue={whatsappConfig?.wabaId ?? ""} placeholder="e.g. 123456789012345" />
                    {state.errors?.whatsappWabaId && (
                      <p className="text-xs text-stamp mt-1">{state.errors.whatsappWabaId[0]}</p>
                    )}
                    <p className="text-[11px] text-ink-soft mt-1">WhatsApp Business Account ID — needed for message templates.</p>
                  </div>
                  <div>
                    <Label>API Key (Access Token)</Label>
                    <Input name="whatsappApiKey" type="password" defaultValue={whatsappConfig?.apiKey ?? ""} placeholder="EAAG..." />
                  </div>
                </div>
                <WhatsAppTemplates hasWabaId={Boolean(whatsappConfig?.wabaId)} />
              </div>
            )}
          </div>
        </details>
        <input type="hidden" name="whatsappEnabled" value={whatsappEnabled ? "true" : "false"} />
        <p className="text-xs text-ink-soft mt-2">
          Configure to send follow-up reminders via WhatsApp. Without this, click-to-chat links still work.
        </p>
      </div>

      {/* Custom fields */}
      <div className="border-t border-rule pt-4">
        <div className="flex items-center mb-3">
          <span className="block text-xs font-semibold mb-1.5 text-ink-soft">Custom lead fields</span>
          <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={addField}>
            + Add field
          </Button>
        </div>
        {fields.length > 0 && (
          <div className="space-y-2 mb-3">
            {fields.map((field, idx) => (
              <div key={idx} className="flex flex-col sm:flex-row gap-2 sm:items-center sm:flex-nowrap">
                <Input
                  placeholder="Label (e.g. Industry)"
                  value={field.label}
                  onChange={(e) => updateField(idx, "label", e.target.value)}
                  className="flex-1 min-w-0 sm:min-w-[120px]"
                />
                <div className="flex gap-2 items-center">
                  <select
                    value={field.type}
                    onChange={(e) => updateField(idx, "type", e.target.value)}
                    className="font-sans text-sm px-3 py-2.5 border border-rule rounded bg-paper min-h-[44px] flex-1 sm:flex-none"
                  >
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="select">Select</option>
                    <option value="date">Date</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => removeField(idx)}
                    className="text-xs text-ink-soft hover:text-stamp px-2 min-w-[40px] min-h-[40px] flex items-center justify-center active:bg-stamp/10 rounded"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <input
          type="hidden"
          name="customFields"
          value={JSON.stringify(fields.filter((f) => f.label))}
        />
        <p className="text-xs text-ink-soft">
          Custom fields appear on the lead form and can be filtered/sorted in the leads list.
        </p>
      </div>

      {state.message && (
        <p className="text-sm text-stamp bg-stamp/10 px-3 py-2 rounded">{state.message}</p>
      )}

      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
