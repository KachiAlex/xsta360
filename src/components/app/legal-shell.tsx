import Link from "next/link";
import { Logo } from "@/components/app/logo";

/**
 * Shared shell for public legal pages (privacy, terms of service).
 * Matches the landing page nav/footer styling.
 */
export function LegalShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <nav className="sticky top-0 z-50 flex items-center justify-between px-5 sm:px-12 py-4 sm:py-5 bg-paper/92 backdrop-blur-[6px] border-b border-rule">
        <Logo size="lg" />
        <div className="flex gap-3 items-center text-sm">
          <Link href="/login" className="btn btn-ghost inline-block font-semibold text-sm px-3 sm:px-5 py-2 sm:py-2.5 rounded-[3px] border-[1.5px] border-ink bg-transparent text-ink hover:bg-paper-2 min-h-[40px] flex items-center">Sign in</Link>
          <Link href="/signup" className="btn btn-primary inline-block font-semibold text-sm px-3 sm:px-5 py-2 sm:py-2.5 rounded-[3px] border-[1.5px] border-ink bg-ink text-paper hover:bg-stamp-deep hover:border-stamp-deep min-h-[40px] flex items-center">Start free</Link>
        </div>
      </nav>

      <main className="max-w-[780px] mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <h1 className="font-mono text-3xl sm:text-4xl font-bold m-0 mb-2">{title}</h1>
        <p className="text-sm text-ink-soft font-mono mb-10">Last updated: {updated}</p>
        <div className="space-y-8 text-[15px] leading-relaxed text-ink-soft [&_h2]:font-mono [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-ink [&_h2]:m-0 [&_h2]:mb-3 [&_p]:m-0 [&_ul]:m-0 [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_li]:list-disc [&_a]:text-stamp [&_a]:underline [&_a]:underline-offset-2">
          {children}
        </div>
      </main>

      <footer className="border-t border-rule px-4 sm:px-12 py-6 sm:py-8 flex justify-between items-center text-[13px] text-ink-soft font-mono flex-wrap gap-3">
        <span>© {new Date().getFullYear()} XSTA360</span>
        <span className="flex gap-4">
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>
          <Link href="/termsofservice" className="hover:text-ink">Terms</Link>
        </span>
        <span>
          Powered by{" "}
          <a href="https://kreatix.tech" target="_blank" rel="noopener noreferrer" className="text-ink font-semibold hover:text-stamp transition-colors">
            Kreatix Technologies
          </a>
        </span>
      </footer>
    </>
  );
}
