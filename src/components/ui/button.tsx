import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "ghost";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center font-semibold rounded-[3px] border-[1.5px] border-ink cursor-pointer transition-[transform,background,color] duration-150 focus-visible:outline-[3px] focus-visible:outline-amber focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-paper hover:bg-stamp-deep hover:border-stamp-deep hover:-translate-y-px",
  ghost: "bg-transparent text-ink hover:bg-paper-2",
};

const sizes: Record<Size, string> = {
  sm: "text-[13px] px-3 py-1.5",
  md: "text-sm px-5 py-2.5",
  lg: "text-[15px] px-[26px] py-3.5",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className = "", ...props }, ref) => (
    <button
      ref={ref}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  ),
);
Button.displayName = "Button";
