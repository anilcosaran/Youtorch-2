"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  label,
  align = "start",
  size = "md",
  className,
  menuClassName,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  /** Accessible name, also shown as a muted prefix when provided. */
  label?: string;
  align?: "start" | "end";
  size?: "md" | "lg";
  className?: string;
  menuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    root.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
      root.current?.querySelector<HTMLButtonElement>("button")?.focus();
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return setOpen(true);
      const items = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])];
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    }
  };

  return (
    <div ref={root} className="relative" onKeyDown={onKeyDown}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-2 border border-line text-fg transition hover:border-line-strong",
          size === "lg"
            ? "h-10 rounded-md bg-white/[0.04] pr-3 pl-3 text-[14px] hover:bg-white/[0.06]"
            : "h-8 rounded-lg bg-white/[0.025] pr-2.5 pl-3 text-[13px] hover:bg-white/[0.04]",
          open && "border-line-strong bg-white/[0.06]",
          className,
        )}
      >
        <span className="flex-1 truncate text-left">{current?.label}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          className={cn(
            "absolute top-full z-30 mt-1.5 min-w-full animate-fade-up rounded-lg border border-line-strong bg-overlay p-1 shadow-2xl shadow-black/70",
            align === "end" ? "right-0" : "left-0",
            menuClassName,
          )}
        >
          {options.map((o) => {
            const selected = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-start gap-2 rounded-md px-2.5 text-left whitespace-nowrap outline-none hover:bg-white/[0.06] focus-visible:bg-white/[0.08]",
                  size === "lg" ? "py-2 text-[14px]" : "py-1.5 text-[13px]",
                )}
              >
                <span className="flex-1">
                  <span className="block text-fg">{o.label}</span>
                  {o.description && <span className="block text-[12.5px] text-muted">{o.description}</span>}
                </span>
                <Check className={cn("mt-0.5 size-3.5 shrink-0", selected ? "text-fg" : "invisible")} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
