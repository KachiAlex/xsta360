"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface BottomNavProps {
  todayCount: number;
}

const NAV = [
  { href: "/dashboard", label: "Overview", icon: "▤" },
  { href: "/follow-ups", label: "Follow-Ups", icon: "☎" },
  { href: "/pipeline", label: "Pipeline", icon: "▦" },
  { href: "/leads", label: "Leads", icon: "▥" },
  { href: "/tasks", label: "Tasks", icon: "✓" },
];

export function BottomNav({ todayCount }: BottomNavProps) {
  const pathname = usePathname();

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-ink text-paper border-t border-white/10 flex items-stretch justify-around min-h-[56px]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {NAV.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center gap-1 py-2 px-1 flex-1 min-h-[56px] relative transition-colors ${
              active ? "text-amber" : "text-[#9fae9f]"
            }`}
          >
            <span className="text-xl leading-none">{item.icon}</span>
            <span className="text-[10px] font-mono leading-none">{item.label}</span>
            {item.href === "/dashboard" && todayCount > 0 && (
              <span className="absolute top-1 right-[calc(50%-18px)] bg-stamp text-paper text-[9px] font-mono font-bold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center">
                {todayCount}
              </span>
            )}
            {active && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-amber rounded-full" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
