"use client";

import { cn } from "@/lib/utils";

/** A compact single-choice switch, e.g. for a time range. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  disabled = false,
}: {
  /** Null while nothing is picked yet. */
  value: T | null;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  label: string;
  disabled?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border bg-muted/60 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={cn(
            "h-6 rounded-md px-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
            value === option.value
              ? "bg-card text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
