import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "accent";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary: "bg-white text-black hover:bg-white/85",
  accent: "bg-ember-500 text-[#fff] hover:bg-ember-400",
  secondary: "bg-white/[0.08] text-fg hover:bg-white/[0.13]",
  outline: "border border-white/[0.12] text-fg hover:bg-white/[0.06]",
  ghost: "text-muted hover:text-fg hover:bg-white/[0.07]",
};

const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[13px] gap-1.5 rounded-md [&_svg]:size-3.5",
  md: "h-8 px-3 text-[13px] gap-1.5 rounded-lg [&_svg]:size-3.5",
  lg: "h-10 px-4 text-[14px] gap-2 rounded-lg [&_svg]:size-4",
  icon: "size-8 rounded-lg [&_svg]:size-4",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function buttonClass({
  variant = "secondary",
  size = "md",
  className,
}: { variant?: Variant; size?: Size; className?: string } = {}) {
  return cn(
    "inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors duration-150 select-none disabled:pointer-events-none disabled:opacity-40 [&_svg]:shrink-0",
    variants[variant],
    sizes[size],
    className,
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "secondary", size = "md", type = "button", ...props },
  ref,
) {
  return <button ref={ref} type={type} className={buttonClass({ variant, size, className })} {...props} />;
});
