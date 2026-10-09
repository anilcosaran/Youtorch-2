"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Control } from "../../lib/playground";

type ChoiceControl = Extract<Control, { kind: "choice" }>;

export const chipClass =
  "flex h-11 w-full min-w-0 items-center gap-2 rounded-xl border border-line bg-canvas/50 px-3 text-[14px] font-medium text-fg transition hover:border-line-strong hover:bg-white/[0.04]";

/** Compact picker for one setting: shows the current value, opens a menu of options with prices or previews. */
export function SettingChip({
  control,
  value,
  onChange,
  align = "start",
  className,
}: {
  control: ChoiceControl;
  value: string;
  onChange: (value: string) => void;
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = control.options.find((o) => o.value === value);
  const Icon = control.icon;

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    root.current?.querySelector<HTMLButtonElement>('[role="option"][aria-selected="true"]')?.focus();
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
      root.current?.querySelector<HTMLButtonElement>("button")?.focus();
    }
    if (open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      const items = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])];
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    }
  };

  return (
    <div ref={root} className={cn("relative min-w-0 flex-auto", className)} onKeyDown={onKeyDown}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${control.label}: ${current?.label}`}
        title={control.label}
        onClick={() => setOpen((o) => !o)}
        className={cn(chipClass, open && "border-line-strong bg-white/[0.06]")}
      >
        {control.id === "aspect" ? <AspectGlyph value={value} /> : <Icon className="size-4 shrink-0 text-muted" />}
        <span className="truncate">{current?.label}</span>
        {control.id === "mode" && (
          <ChevronDown className={cn("ml-auto size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
        )}
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label={control.label}
          className={cn(
            "absolute top-full z-30 mt-1.5 w-max max-w-[260px] min-w-full animate-pop rounded-xl border border-line-strong bg-overlay p-1 shadow-2xl shadow-black/60",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          <p className="px-2.5 pt-1.5 pb-1 eyebrow">{control.label}</p>
          {control.options.map((o) => {
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
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left whitespace-nowrap outline-none hover:bg-white/[0.06] focus-visible:bg-white/[0.08]"
              >
                {control.id === "aspect" && <AspectGlyph value={o.value} />}
                <span className="flex-1">
                  <span className="block text-[13.5px] text-fg">{o.label}</span>
                  {o.description && <span className="block text-[12px] text-muted">{o.description}</span>}
                </span>
                <Check className={cn("size-3.5 shrink-0", selected ? "text-fg" : "invisible")} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AspectGlyph({ value }: { value: string }) {
  const [w, h] = value.split(":").map(Number);
  const scale = 14 / Math.max(w, h);
  return (
    <span className="grid size-4 shrink-0 place-items-center text-muted">
      <span className="rounded-[3px] border-[1.5px] border-current" style={{ width: w * scale, height: h * scale }} />
    </span>
  );
}
