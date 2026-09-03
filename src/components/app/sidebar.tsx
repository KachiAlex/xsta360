"use client";

import { useState, useEffect } from "react";
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
  { href: "/dashboard", label: "Overview", icon: "▤", key: "today" },
  { href: "/follow-ups", label: "Follow-Ups", icon: "☎", key: "followups" },
  { href: "/tasks", label: "To-Dos & Notes", icon: "✓", key: "tasks" },
  { href: "/pipeline", label: "Pipeline", icon: "▦", key: "pipeline" },
  { href: "/leads", label: "Leads", icon: "▥", key: "leads" },
  { href: "/sequences", label: "Sequences", icon: "↻", key: "sequences" },
  { href: "/reports", label: "Reports", icon: "▧", key: "reports" },
  { href: "/billing", label: "Billing", icon: "₦", key: "billing" },
  { href: "/contact-card", label: "Contact Card", icon: "▣", key: "contact-card" },
  { href: "/settings", label: "Settings", icon: "⚙", key: "settings" },
];

export function Sidebar({ orgName, userName, userInitials, role, todayCount }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Mobile toggle button — opens full menu for secondary nav items */}
      <button
        type="button"
        className="md:hidden fixed left-2.5 z-50 bg-ink text-paper w-10 h-10 rounded-md font-mono text-sm flex items-center justify-center shadow-lg active:scale-95 transition-transform"
        onClick={() => setMobileOpen(!mobileOpen)}
        style={{ top: "calc(0.625rem + env(safe-area-inset-top))" }}
        aria-label="Toggle menu"
      >
        {mobileOpen ? "✕" : "☰"}
      </button>

      {/* Overlay for mobile */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-ink/50 z-30 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`bg-ink text-paper w-72 flex flex-col py-6 px-4 shrink-0 fixed md:relative top-0 left-0 h-full md:h-auto z-40 transition-transform duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <Link href="/" className="logo font-mono font-bold text-lg flex items-center gap-2 mb-7 px-1.5 hover:opacity-80 transition-opacity">
          <span className="w-[9px] h-[9px] rounded-full bg-amber" />
          XSTA360
        </Link>

        <div className="org-switch font-mono text-xs text-[#9fae9f] bg-white/[0.06] border border-white/10 rounded px-3 py-2 mb-6 cursor-default truncate">
          {orgName}
        </div>

        <nav className="flex flex-col gap-1.5 overflow-y-auto">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded text-sm font-medium border-none text-left ${
                  active ? "bg-paper text-ink" : "text-[#c9cfc7] hover:bg-white/[0.06] hover:text-paper"
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
            <div className="avatar w-7 h-7 rounded-full bg-stamp flex items-center justify-center font-mono text-[11px] font-bold text-paper shrink-0">
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
    </>
  );
}
