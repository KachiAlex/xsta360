import Link from "next/link";

export function Logo({
  className = "",
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: "text-sm",
    md: "text-lg",
    lg: "text-xl",
  };
  const dot = {
    sm: "w-2 h-2",
    md: "w-2.5 h-2.5",
    lg: "w-2.5 h-2.5",
  };

  return (
    <Link
      href="/"
      className={`font-mono font-bold ${sizes[size]} flex items-center gap-2.5 w-fit min-h-[40px] hover:opacity-80 transition-opacity ${className}`}
    >
      <span
        className={`${dot[size]} rounded-full bg-stamp shadow-[0_0_0_3px_rgba(178,58,46,0.15)] shrink-0`}
      />
      XSTA360
    </Link>
  );
}
