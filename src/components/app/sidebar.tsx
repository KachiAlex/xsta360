"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signout } from "@/app/actions/auth";

export interface SidebarProps {
  orgName: string;
  userName: string;
  userInitials: string;
  role: string;
  todayCount: number;
}

const NAV = [
  { href: "/dashboard", label: "Today's Follow-Ups", icon: "▤", key: "today" },
  { href: "/pipeline", label: "Pipeline", icon: "▦", key: "pipeline" },
  { href: "/leads", label: "Leads", icon: "▥", key: "leads" },
  { href: "/reports", label: "Reports", icon: "▧", key: "reports" },
  { href: "/settings", label: "Settings", icon: "⚙", key: "settings" },
];

export function Sidebar({ orgName, userName, userInitials, role, todayCount }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="bg-ink text-paper w-60 flex flex-col py-6 px-4 shrink-0">
      <div className="logo font-mono font-bold text-lg flex items-center gap-2 mb-7 px-1.5">
        <span className="w-[9px] h-[9px] rounded-full bg-amber" />
        XSTA360
      </div>

      <div className="org-switch font-mono text-xs text-[#9fae9f] bg-white/[0.06] border border-white/10 rounded px-3 py-2 mb-6 cursor-default">
        {orgName}
      </div>

      <nav className="flex flex-col gap-1.5">
        {NAV.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded text-sm font-medium border-none text-left ${
                active
                  ? "bg-paper text-ink"
                  : "text-[#c9cfc7] hover:bg-white/[0.06] hover:text-paper"
              }`}
            >
              <span className="w-4 text-center font-mono text-[13px]">{item.icon}</span>
              {item.label}
              {item.key === "today" && todayCount > 0 && (
                <span
                  className={`ml-auto font-mono text-[11px] px-[7px] py-px rounded-full ${
                    active ? "bg-paper-2 text-stamp-deep" : "bg-white/10"
                  }`}
                >
                  {todayCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-4 border-t border-white/10">
        <div className="flex items-center gap-2.5 text-[13px] text-[#c9cfc7]">
          <div className="avatar w-7 h-7 rounded-full bg-stamp flex items-center justify-center font-mono text-[11px] font-bold text-paper">
            {userInitials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="truncate">{userName}</div>
            <div className="text-[11px] text-[#9fae9f] capitalize">{role}</div>
          </div>
        </div>
        <form action={signout}>
          <button
            type="submit"
            className="mt-3 w-full text-left text-xs text-[#9fae9f] hover:text-paper px-1"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
