import Link from "next/link";

export const CONTACT_EMAIL = "admin@kreatixtech.com";
export const CONTACT_PHONE = "+2347089881454";
export const CONTACT_PHONE_DISPLAY = "+234 708 988 1454";
// wa.me needs digits only (no + or spaces) — opens a WhatsApp chat.
export const CONTACT_WHATSAPP = `https://wa.me/${CONTACT_PHONE.replace(/[^0-9]/g, "")}`;

/**
 * Shared public-site footer — contact details, legal links, and the
 * Kreatix Technologies attribution. Used on the landing page and legal pages.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-rule px-4 sm:px-12 py-6 sm:py-8 font-mono text-[13px] text-ink-soft">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <span className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-ink font-semibold text-ink">
            ✉ {CONTACT_EMAIL}
          </a>
          <a href={CONTACT_WHATSAPP} target="_blank" rel="noopener noreferrer" className="hover:text-ink font-semibold text-ink">
            💬 WhatsApp: {CONTACT_PHONE_DISPLAY}
          </a>
        </span>
        <span className="flex gap-4">
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>
          <Link href="/termsofservice" className="hover:text-ink">Terms</Link>
        </span>
      </div>
      <div className="flex flex-wrap justify-between items-center gap-3 pt-4 border-t border-dashed border-rule">
        <span>© {new Date().getFullYear()} XSTA360</span>
        <span>
          A product of{" "}
          <a
            href="https://kreatix.tech"
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink font-semibold hover:text-stamp transition-colors"
          >
            Kreatix Technologies
          </a>
        </span>
      </div>
    </footer>
  );
}
