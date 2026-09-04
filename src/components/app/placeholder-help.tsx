"use client";

import { useState } from "react";

const PLACEHOLDERS = [
  { token: "{{lead_name}}", description: "Lead's full name" },
  { token: "{{first_name}}", description: "Lead's first name" },
  { token: "{{lead_company}}", description: "Lead's company" },
  { token: "{{lead_phone}}", description: "Lead's phone number" },
  { token: "{{lead_email}}", description: "Lead's email" },
  { token: "{{rep_name}}", description: "Assigned rep's name" },
  { token: "{{org_name}}", description: "Your organization name" },
];

const FORMATTING_TIPS = [
  { syntax: "**text**", result: "Bold (email only)" },
  { syntax: "*text*", result: "Italic (email only)" },
  { syntax: "[link](https://...)", result: "Clickable link (email only)" },
  { syntax: "*text*", result: "Bold (WhatsApp)" },
  { syntax: "_text_", result: "Italic (WhatsApp)" },
  { syntax: "~text~", result: "Strikethrough (WhatsApp)" },
];

export function PlaceholderHelp() {
  const [open, setOpen] = useState(false);

  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-ink-soft hover:text-ink underline underline-offset-2"
      >
        {open ? "Hide formatting help" : "Show formatting help"}
      </button>

      {open && (
        <div className="mt-2 space-y-3 p-2.5 bg-paper rounded border border-rule">
          {/* Placeholders */}
          <div>
            <div className="font-mono font-semibold text-[10px] uppercase tracking-wider text-ink-soft mb-1.5">
              Variables
            </div>
            <div className="space-y-1">
              {PLACEHOLDERS.map((p) => (
                <div key={p.token} className="flex items-center gap-2">
                  <code className="font-mono text-[11px] bg-paper-2 px-1.5 py-0.5 rounded text-ink">
                    {p.token}
                  </code>
                  <span className="text-ink-soft">{p.description}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Formatting */}
          <div>
            <div className="font-mono font-semibold text-[10px] uppercase tracking-wider text-ink-soft mb-1.5">
              Formatting
            </div>
            <div className="space-y-1">
              {FORMATTING_TIPS.map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  <code className="font-mono text-[11px] bg-paper-2 px-1.5 py-0.5 rounded text-ink">
                    {f.syntax}
                  </code>
                  <span className="text-ink-soft">{f.result}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Example */}
          <div>
            <div className="font-mono font-semibold text-[10px] uppercase tracking-wider text-ink-soft mb-1.5">
              Example
            </div>
            <pre className="font-mono text-[11px] bg-paper-2 p-2 rounded text-ink-soft whitespace-pre-wrap">
{`Hi {{first_name}},

This is {{rep_name}} from **{{org_name}}**.
Following up on [our proposal](https://xsta360.com.ng).

Are you available for a quick call this week?`}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

/** Static export for use in other components */
export const PLACEHOLDER_HELP_ITEMS = PLACEHOLDERS;
