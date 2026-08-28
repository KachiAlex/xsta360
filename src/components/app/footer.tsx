export function Footer({ className = "" }: { className?: string }) {
  return (
    <footer
      className={`border-t border-rule px-4 sm:px-8 py-4 flex justify-between items-center text-[11px] sm:text-[13px] text-ink-soft font-mono flex-wrap gap-2 ${className}`}
    >
      <span>© {new Date().getFullYear()} XSTA360</span>
      <span>
        Powered by{" "}
        <a
          href="https://kreatix.tech"
          target="_blank"
          rel="noopener noreferrer"
          className="text-ink font-semibold hover:text-stamp transition-colors"
        >
          Kreatix Technologies
        </a>
      </span>
    </footer>
  );
}
