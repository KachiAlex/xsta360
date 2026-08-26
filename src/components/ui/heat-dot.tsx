type Heat = "hot" | "warm" | "cold";

const styles: Record<Heat, string> = {
  hot: "bg-stamp shadow-[0_0_0_4px_rgba(178,58,46,0.14)]",
  warm: "bg-amber shadow-[0_0_0_4px_rgba(217,138,43,0.14)]",
  cold: "bg-cold",
};

export function HeatDot({ heat, className = "" }: { heat: Heat; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block w-[9px] h-[9px] rounded-full shrink-0 ${styles[heat]} ${className}`}
    />
  );
}
