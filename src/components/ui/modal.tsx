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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/45"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-panel w-[420px] max-w-[90vw] rounded-md border border-rule p-6 shadow-[0_30px_60px_-20px_rgba(30,42,34,0.4)]">
        <h3 className="font-mono text-base m-0 mb-1">{title}</h3>
        {sub && <div className="text-xs text-ink-soft font-mono mb-[18px]">{sub}</div>}
        {children}
      </div>
    </div>
  );
}
