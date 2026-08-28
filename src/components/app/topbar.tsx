"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

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
      <div className="flex items-center justify-between px-3 sm:px-6 lg:px-8 py-2 sm:py-3.5 gap-2">
        {/* Left: logo (mobile) + view tabs */}
        {/* Mobile logo — sits next to the hamburger button */}
        <Link
          href="/"
          className="md:hidden font-mono font-bold text-sm flex items-center gap-1.5 shrink-0 pl-11 min-h-[40px] hover:opacity-80 transition-opacity"
        >
          <span className="w-2 h-2 rounded-full bg-stamp shadow-[0_0_0_3px_rgba(178,58,46,0.15)] shrink-0" />
          XSTA360
        </Link>

        {children && (
          <div className="hidden md:flex gap-1 bg-paper-2 rounded-md p-[3px] shrink-0 overflow-x-auto max-w-[50%] sm:max-w-none">{children}</div>
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
            className="sm:hidden text-sm font-mono border border-rule bg-paper px-3 py-2 rounded min-w-[40px] min-h-[40px] flex items-center justify-center active:bg-paper-2 transition-colors"
            onClick={() => setSearchOpen(!searchOpen)}
            aria-label="Search"
          >
            {searchOpen ? "✕" : "🔍"}
          </button>
          {/* Desktop actions only — mobile uses FAB */}
          <div className="hidden sm:flex items-center gap-2">{actions}</div>
        </div>
      </div>

      {/* Mobile search drawer */}
      {searchOpen && (
        <div className="sm:hidden px-4 pb-3">
          <input
            className="search font-mono text-[13px] border border-rule bg-paper px-3 py-2.5 rounded w-full min-h-[44px]"
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
      className={`border-none bg-none px-3 sm:px-4 py-2 text-[12px] sm:text-[13.5px] font-semibold rounded whitespace-nowrap min-h-[40px] flex items-center ${
        active ? "bg-panel text-ink shadow-[0_1px_0_var(--color-rule)]" : "text-ink-soft"
      }`}
    >
      {children}
    </a>
  );
}
