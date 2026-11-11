"use client";

import { useRef } from "react";
import { PLACEHOLDER_HELP_ITEMS } from "@/components/app/placeholder-help";

/**
 * Plain-text textarea with a formatting toolbar.
 * Wraps the current selection in WhatsApp-style markers:
 *   *bold*  _italic_  ~strikethrough~  ```monospace```  > quote  - bullet
 * Also offers a variable inserter ({{first_name}} etc.) so users don't
 * have to remember token spellings. Submits plain text via `name`.
 */
export function FormatTextarea({
  name,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  /** Wrap the selection (or insert at caret) with prefix/suffix markers. */
  function wrap(prefix: string, suffix = prefix) {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e, value: v } = el;
    const sel = v.slice(s, e) || "text";
    onChange(v.slice(0, s) + prefix + sel + suffix + v.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + prefix.length, s + prefix.length + sel.length);
    });
  }

  /** Insert a marker at the start of the line the caret is on. */
  function linePrefix(prefix: string) {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e, value: v } = el;
    const lineStart = v.lastIndexOf("\n", Math.max(0, s - 1)) + 1;
    onChange(v.slice(0, lineStart) + prefix + v.slice(lineStart));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + prefix.length, e + prefix.length);
    });
  }

  /** Insert raw text (e.g. a {{placeholder}} token) at the caret. */
  function insert(text: string) {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e, value: v } = el;
    onChange(v.slice(0, s) + text + v.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + text.length, s + text.length);
    });
  }

  const btnClass =
    "px-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center rounded hover:bg-paper-2 text-xs font-semibold border border-transparent hover:border-rule transition-colors font-mono";

  return (
    <div className="border border-rule rounded bg-paper overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 flex-wrap border-b border-rule bg-panel px-1.5 py-1">
        <button type="button" onClick={() => wrap("*")} className={btnClass} title="Bold" aria-label="Bold">
          <strong>B</strong>
        </button>
        <button type="button" onClick={() => wrap("_")} className={btnClass} title="Italic" aria-label="Italic">
          <em>I</em>
        </button>
        <button type="button" onClick={() => wrap("~")} className={btnClass} title="Strikethrough" aria-label="Strikethrough">
          <s>S</s>
        </button>
        <button type="button" onClick={() => wrap("```")} className={btnClass} title="Monospace" aria-label="Monospace">
          {"</>"}
        </button>

        <span className="w-px h-5 bg-rule mx-1" />

        <button type="button" onClick={() => linePrefix("> ")} className={btnClass} title="Quote" aria-label="Quote">
          ❝
        </button>
        <button type="button" onClick={() => linePrefix("- ")} className={btnClass} title="Bullet list" aria-label="Bullet list">
          •
        </button>
        <button type="button" onClick={() => linePrefix("1. ")} className={btnClass} title="Numbered list" aria-label="Numbered list">
          1.
        </button>

        <span className="w-px h-5 bg-rule mx-1" />

        {/* Variable inserter */}
        <select
          className="text-xs bg-panel border border-rule rounded px-1.5 min-h-[32px] font-mono cursor-pointer"
          value=""
          onChange={(e) => {
            if (e.currentTarget.value) insert(e.currentTarget.value);
            e.currentTarget.value = "";
          }}
          aria-label="Insert variable"
          title="Insert variable"
        >
          <option value="" disabled>
            {"{{…}}"} Field
          </option>
          {PLACEHOLDER_HELP_ITEMS.map((p) => (
            <option key={p.token} value={p.token}>
              {p.token}
            </option>
          ))}
        </select>
      </div>

      <textarea
        ref={ref}
        name={name}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full font-sans text-sm px-3 py-2.5 bg-paper focus:outline-none resize-vertical"
      />
    </div>
  );
}
