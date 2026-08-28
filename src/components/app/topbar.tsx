"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export interface TopbarProps {
  /** Optional leading content (e.g. view tabs). */
  children?: React.ReactNode;
  /** Search placeholder; search updates ?q= and triggers a server re-render. */
  searchPlaceholder?: string;
  /** Trailing actions (e.g. Add lead button). */
  actions?: React.ReactNode;
}

export function Topbar({ children, searchPlaceholder = "Search leads...", actions }: TopbarProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <div className="topbar sticky top-0 z-10 bg-panel border-b border-rule">
      <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 py-3.5 gap-2">
        {/* Left: view tabs */}
        {children && (
          <div className="flex gap-1 bg-paper-2 rounded-md p-[3px] shrink-0 overflow-x-auto">{children}</div>
        )}

        {/* Right: search + actions */}
        <div className="flex gap-2 items-center ml-auto">
          {/* Desktop search */}
          <input
            className="search font-mono text-[13px] border border-rule bg-paper px-3 py-2 rounded w-[140px] sm:w-[180px] lg:w-[220px] hidden sm:block"
            type="text"
            placeholder={searchPlaceholder}
            defaultValue={params.get("q") ?? ""}
            onChange={(e) => {
              const q = e.target.value.trim();
              const url = new URL(window.location.href);
              if (q) url.searchParams.set("q", q);
              else url.searchParams.delete("q");
              router.replace(url.pathname + url.search);
            }}
          />
          {/* Mobile search toggle */}
          <button
            type="button"
            className="sm:hidden text-sm font-mono border border-rule bg-paper px-2.5 py-2 rounded"
            onClick={() => setSearchOpen(!searchOpen)}
            aria-label="Search"
          >
            {searchOpen ? "✕" : "🔍"}
          </button>
          {actions}
        </div>
      </div>

      {/* Mobile search drawer */}
      {searchOpen && (
        <div className="sm:hidden px-4 pb-3">
          <input
            className="search font-mono text-[13px] border border-rule bg-paper px-3 py-2 rounded w-full"
            type="text"
            placeholder={searchPlaceholder}
            defaultValue={params.get("q") ?? ""}
            onChange={(e) => {
              const q = e.target.value.trim();
              const url = new URL(window.location.href);
              if (q) url.searchParams.set("q", q);
              else url.searchParams.delete("q");
              router.replace(url.pathname + url.search);
            }}
            autoFocus
          />
        </div>
      )}
    </div>
  );
}

export function ViewTab({
  active,
  href,
  children,
}: {
  active: boolean;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={`border-none bg-none px-3 sm:px-4 py-2 text-[12px] sm:text-[13.5px] font-semibold rounded whitespace-nowrap ${
        active ? "bg-panel text-ink shadow-[0_1px_0_var(--color-rule)]" : "text-ink-soft"
      }`}
    >
      {children}
    </a>
  );
}
