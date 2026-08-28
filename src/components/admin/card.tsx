export function Card({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: number | string;
  sub?: string;
  tone?: "default" | "register" | "stamp";
}) {
  const toneClass = {
    default: "text-ink",
    register: "text-register",
    stamp: "text-stamp",
  }[tone];

  return (
    <div className="bg-panel border border-rule rounded-md p-3 sm:p-4">
      <div className="font-mono text-[10px] sm:text-[11px] uppercase tracking-wider text-ink-soft mb-1.5">
        {label}
      </div>
      <div className={`font-mono text-xl sm:text-2xl font-bold ${toneClass}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-ink-soft mt-1">{sub}</div>}
    </div>
  );
}
