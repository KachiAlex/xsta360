type BadgeTone = "overdue" | "today" | "later" | "neutral" | "won" | "lost";

const tones: Record<BadgeTone, string> = {
  overdue: "bg-stamp/12 text-stamp-deep",
  today: "bg-amber/14 text-[#9c6014]",
  later: "bg-cold/18 text-ink-soft",
  neutral: "bg-paper-2 text-ink-soft",
  won: "bg-register/12 text-register",
  lost: "bg-stamp/12 text-stamp-deep",
};

export function Badge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-block font-mono text-[11px] font-semibold px-2 py-[3px] rounded-[3px] ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
