"use client";

import { useActionState, useState } from "react";
import { updateOrgSettings, type OrgFormState } from "@/app/actions/org";
import { Button } from "@/components/ui/button";
import { Label, Input, Textarea } from "@/components/ui/field";

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
}: {
  currency: string;
  replyToEmail: string | null;
  whatsappConfig: { enabled?: boolean; phoneNumberId?: string; apiKey?: string } | null;
  customFieldDefs: CustomFieldDef[];
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
      </div>

      {/* WhatsApp config */}
      <div className="border-t border-rule pt-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="block text-xs font-semibold mb-1.5 text-ink-soft">WhatsApp Business</span>
          <label className="flex items-center gap-1.5 text-xs ml-auto">
            <input
              type="checkbox"
              checked={whatsappEnabled}
              onChange={(e) => setWhatsappEnabled(e.target.checked)}
            />
            Enable
          </label>
        </div>
        <input type="hidden" name="whatsappEnabled" value={whatsappEnabled ? "true" : "false"} />
        {whatsappEnabled && (
          <>
            <details className="mb-3 rounded border border-rule bg-paper/60 text-xs">
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
                  Copy the <strong>Phone Number ID</strong> shown under your number (it&apos;s a numeric ID, not the phone number).
                </li>
                <li>
                  For testing, copy the <strong>Temporary access token</strong> on the same page (expires in 24 hours).
                </li>
                <li>
                  For production, create a permanent token:{" "}
                  <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noopener noreferrer" className="text-stamp underline underline-offset-2">
                    business.facebook.com → System Users
                  </a>{" "}
                  → Add system user → Generate token → select your app → check <code>whatsapp_business_messaging</code>.
                </li>
                <li>Paste both values here and save.</li>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Phone Number ID</Label>
                <Input name="whatsappPhoneNumberId" defaultValue={whatsappConfig?.phoneNumberId ?? ""} placeholder="123456789" />
              </div>
              <div>
                <Label>API Key (Access Token)</Label>
                <Input name="whatsappApiKey" type="password" defaultValue={whatsappConfig?.apiKey ?? ""} placeholder="EAAG..." />
              </div>
            </div>
          </>
        )}
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
