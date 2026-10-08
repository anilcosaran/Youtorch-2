"use client";

import { cn } from "@/lib/cn";

export function Switch({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full border transition-colors",
        checked ? "border-ember-400/60 bg-ember-500" : "border-line-strong bg-white/[0.06]",
      )}
    >
      <span
        className={cn("absolute top-0.5 left-0.5 size-3.5 rounded-full bg-[#fff] shadow transition-transform", checked && "translate-x-4")}
      />
    </button>
  );
}
