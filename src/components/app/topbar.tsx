"use client";

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

  return (
    <div className="topbar sticky top-0 z-10 flex items-center justify-between px-8 py-5 border-b border-rule bg-panel">
      <div className="flex gap-1 bg-paper-2 rounded-md p-[3px]">{children}</div>
      <div className="flex gap-3 items-center">
        <input
          className="search font-mono text-[13px] border border-rule bg-paper px-3 py-2 rounded w-[220px]"
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
        {actions}
      </div>
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
      className={`border-none bg-none px-4 py-2 text-[13.5px] font-semibold rounded ${
        active ? "bg-panel text-ink shadow-[0_1px_0_var(--color-rule)]" : "text-ink-soft"
      }`}
    >
      {children}
    </a>
  );
}
