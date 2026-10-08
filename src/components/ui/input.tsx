import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

const inputClass =
  "h-10 w-full rounded-[10px] border border-line-strong bg-canvas/60 px-3 text-sm outline-none transition placeholder:text-subtle focus:border-ember-400/70 focus:ring-4 focus:ring-ember-500/10";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputClass, className)} {...props} />;
}

/** Label + control pair for dialog forms. */
export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-[13px] text-muted">{label}</span>
      {children}
    </label>
  );
}
