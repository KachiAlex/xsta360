"use client";

import { useState, useTransition } from "react";
import {
  getWhatsAppTemplates,
  createWhatsAppTemplateAction,
  deleteWhatsAppTemplateAction,
} from "@/app/actions/org";
import { Button } from "@/components/ui/button";
import { Label, Input, Select, Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";

interface Template {
  id: string;
  name: string;
  category: string;
  status: string;
  language: string;
}

export function WhatsAppTemplates({ hasWabaId }: { hasWabaId: boolean }) {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("UTILITY");
  const [body, setBody] = useState("");
  const [examples, setExamples] = useState("");
  const [, startTransition] = useTransition();

  function load() {
    setLoading(true);
    setMsg(null);
    startTransition(async () => {
      const res = await getWhatsAppTemplates();
      setLoading(false);
      if (!res.ok) {
        setMsg(res.message ?? "Could not load templates");
        return;
      }
      setTemplates(res.templates ?? []);
    });
  }

  function create() {
    setMsg(null);
    startTransition(async () => {
      const res = await createWhatsAppTemplateAction({
        name,
        category,
        language: "en_US",
        body,
        examples: examples.split(",").map((s) => s.trim()).filter(Boolean),
      });
      setMsg(res.message ?? (res.ok ? "Created" : "Failed"));
      if (res.ok) {
        setShowCreate(false);
        setName("");
        setBody("");
        setExamples("");
        load();
      }
    });
  }

  function remove(templateName: string) {
    if (!confirm(`Delete template "${templateName}"?`)) return;
    startTransition(async () => {
      const res = await deleteWhatsAppTemplateAction(templateName);
      setMsg(res.message ?? (res.ok ? "Deleted" : "Failed"));
      if (res.ok) load();
    });
  }

  if (!hasWabaId) {
    return (
      <p className="text-[11px] text-ink-soft mt-2">
        Add your WhatsApp Business Account ID above to manage message templates
        (required for messaging leads who haven't contacted you in the last 24 hours).
      </p>
    );
  }

  return (
    <div className="mt-3 border border-rule rounded p-3 bg-panel">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold">Message templates</span>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={load} disabled={loading}>
            {loading ? "Loading…" : templates === null ? "Load templates" : "Refresh"}
          </Button>
          <Button type="button" size="sm" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "Close" : "+ New template"}
          </Button>
        </div>
      </div>

      <p className="text-[11px] text-ink-soft mb-2">
        Meta requires pre-approved templates to message leads who haven't contacted you in the
        last 24 hours — this covers most sequence outreach.
      </p>

      {templates !== null && (
        <div className="divide-y divide-rule border border-rule rounded mb-2">
          {templates.length === 0 && (
            <p className="text-xs text-ink-soft px-3 py-2">No templates yet.</p>
          )}
          {templates.map((t) => (
            <div key={t.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <span className="font-mono text-xs font-medium truncate">{t.name}</span>
              <Badge
                tone={
                  t.status === "APPROVED"
                    ? "won"
                    : t.status === "REJECTED"
                      ? "lost"
                      : "neutral"
                }
              >
                {t.status.toLowerCase()}
              </Badge>
              <span className="text-[11px] text-ink-soft">{t.category}</span>
              <button
                type="button"
                className="ml-auto text-[11px] text-stamp hover:underline px-1.5 py-1"
                onClick={() => remove(t.name)}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="bg-paper-2 rounded p-3 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <Label>Template name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                placeholder="followup_checkin"
              />
              <p className="text-[10px] text-ink-soft mt-0.5">Lowercase letters, numbers, underscores</p>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={category} onChange={(e) => setCategory(e.currentTarget.value)}>
                <option value="UTILITY">Utility (order/transactional)</option>
                <option value="MARKETING">Marketing (promotions, outreach)</option>
              </Select>
            </div>
          </div>
          <div>
            <Label>Message body</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.currentTarget.value)}
              rows={3}
              placeholder={"Hi {{1}}, following up on our conversation about {{2}}."}
            />
            <p className="text-[10px] text-ink-soft mt-0.5">
              Use {"{{1}}"}, {"{{2}}"} for variables
            </p>
          </div>
          <div>
            <Label>Example values (comma-separated)</Label>
            <Input
              value={examples}
              onChange={(e) => setExamples(e.currentTarget.value)}
              placeholder="Adaeze, the proposal"
            />
            <p className="text-[10px] text-ink-soft mt-0.5">
              Required by Meta if your body has {"{{n}}"} placeholders — one example each
            </p>
          </div>
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={create} disabled={!name.trim() || !body.trim()}>
              Submit for approval
            </Button>
          </div>
        </div>
      )}

      {msg && <p className="text-xs font-mono text-ink-soft mt-2">{msg}</p>}
    </div>
  );
}
