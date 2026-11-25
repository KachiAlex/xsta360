"use client";

import { useState } from "react";

/** Code block with a copy button — used on the public API docs page. */
export function CodeBlock({
  title,
  code,
  lang = "bash",
}: {
  title?: string;
  code: string;
  lang?: string;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }

  return (
    <div className="border border-rule rounded-[4px] overflow-hidden bg-ink my-3">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-paper/15">
        <span className="font-mono text-[11px] text-paper/60 uppercase tracking-wider">
          {title ?? lang}
        </span>
        <button
          type="button"
          onClick={copy}
          className="font-mono text-[11px] text-paper/60 hover:text-paper transition-colors"
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <pre className="px-3.5 py-3 overflow-x-auto text-[12.5px] leading-relaxed font-mono text-paper/90 whitespace-pre">
        {code}
      </pre>
    </div>
  );
}
