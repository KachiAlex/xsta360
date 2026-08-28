import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-4 sm:px-12 py-4 sm:py-5 border-b border-rule">
        <Link href="/" className="font-mono font-bold text-lg sm:text-xl flex items-center gap-2.5 w-fit min-h-[44px]">
          <span className="w-2.5 h-2.5 rounded-full bg-stamp shadow-[0_0_0_3px_rgba(178,58,46,0.15)]" />
          XSTA360
        </Link>
      </header>
      <main className="flex-1 flex items-center justify-center px-3 sm:px-6 py-6 sm:py-12">{children}</main>
    </div>
  );
}
