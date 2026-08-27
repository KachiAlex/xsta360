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
  whatsappConfig,
  customFieldDefs,
}: {
  currency: string;
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Phone Number ID</Label>
              <Input name="whatsappPhoneNumberId" defaultValue={whatsappConfig?.phoneNumberId ?? ""} placeholder="123456789" />
            </div>
            <div>
              <Label>API Key (Access Token)</Label>
              <Input name="whatsappApiKey" type="password" defaultValue={whatsappConfig?.apiKey ?? ""} placeholder="EAAG..." />
            </div>
          </div>
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
              <div key={idx} className="flex gap-2 items-center">
                <Input
                  placeholder="Label (e.g. Industry)"
                  value={field.label}
                  onChange={(e) => updateField(idx, "label", e.target.value)}
                  className="flex-1"
                />
                <select
                  value={field.type}
                  onChange={(e) => updateField(idx, "type", e.target.value)}
                  className="font-sans text-sm px-3 py-2.5 border border-rule rounded bg-paper"
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="select">Select</option>
                  <option value="date">Date</option>
                </select>
                <button
                  type="button"
                  onClick={() => removeField(idx)}
                  className="text-xs text-ink-soft hover:text-stamp px-2"
                >
                  ✕
                </button>
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
