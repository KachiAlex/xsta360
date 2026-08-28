"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/app/logo";
import { Footer } from "@/components/app/footer";
import { signout } from "@/app/actions/auth";

const NAV = [
  { href: "/admin", label: "Overview", icon: "📊" },
  { href: "/admin/orgs", label: "Organizations", icon: "🏢" },
  { href: "/admin/users", label: "Users", icon: "👥" },
  { href: "/admin/plans", label: "Plans", icon: "📋" },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: "💳" },
];

export function AdminShell({
  userName,
  email,
  children,
}: {
  userName: string;
  email: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen flex flex-col bg-paper">
      {/* Top bar */}
      <header className="sticky top-0 z-20 bg-panel border-b border-rule">
        <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 py-2.5 gap-4">
          <div className="flex items-center gap-4">
            <Logo size="md" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-stamp bg-stamp/10 px-2 py-0.5 rounded">
              Admin
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-ink-soft font-mono hidden sm:inline">{email}</span>
            <form action={signout}>
              <button
                type="submit"
                className="text-xs font-semibold text-ink-soft hover:text-stamp border border-rule rounded px-3 py-1.5 min-h-[36px] flex items-center active:bg-paper-2 transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar nav */}
        <nav className="w-56 shrink-0 border-r border-rule bg-panel hidden md:flex flex-col py-4 px-3 gap-1">
          {NAV.map((item) => {
            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded text-sm font-medium transition-colors min-h-[44px] ${
                  active
                    ? "bg-paper-2 text-ink"
                    : "text-ink-soft hover:bg-paper-2/50 hover:text-ink"
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Mobile nav — horizontal scroll */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-panel border-t border-rule flex justify-around px-1 py-1 z-20" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          {NAV.map((item) => {
            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded text-[10px] font-medium min-w-[56px] min-h-[48px] justify-center ${
                  active ? "text-stamp" : "text-ink-soft"
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="truncate max-w-[64px]">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Main content */}
        <main className="flex-1 min-w-0 pb-16 md:pb-0">
          <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-7 max-w-[1240px] w-full mx-auto">
            {children}
          </div>
          <Footer />
        </main>
      </div>
    </div>
  );
}
