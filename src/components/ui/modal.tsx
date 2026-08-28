"use client";

import { useEffect } from "react";

export function Modal({
  open,
  onClose,
  title,
  sub,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  sub?: React.ReactNode;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-ink/45 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-panel w-full sm:w-[420px] max-w-[90vw] rounded-t-lg sm:rounded-md border border-rule shadow-[0_30px_60px_-20px_rgba(30,42,34,0.4)] max-h-[92vh] sm:max-h-[90vh] overflow-y-auto flex flex-col"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Sticky header on mobile */}
        <div className="sticky top-0 bg-panel px-5 sm:px-6 pt-5 sm:pt-6 pb-3 border-b border-rule sm:border-0 z-10 flex items-start justify-between">
          <div>
            <h3 className="font-mono text-base m-0 mb-1">{title}</h3>
            {sub && <div className="text-xs text-ink-soft font-mono">{sub}</div>}
          </div>
          {/* Close button — always visible on mobile */}
          <button
            type="button"
            onClick={onClose}
            className="sm:hidden text-xl text-ink-soft hover:text-ink min-w-[40px] min-h-[40px] flex items-center justify-center -mr-2 -mt-1 active:text-ink"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="px-5 sm:px-6 pb-5 sm:pb-6 flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}
