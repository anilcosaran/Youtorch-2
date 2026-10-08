"use client";

import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/cn";
import { setTheme, useTheme, type Theme } from "@/lib/theme";

const options = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
] as const;

/** Dark / light switch; collapses to a single icon button in the narrow sidebar. */
export function ThemeSwitch({ compact = false }: { compact?: boolean }) {
  const theme = useTheme();

  if (compact) {
    const next: Theme = theme === "dark" ? "light" : "dark";
    const Icon = theme === "dark" ? Moon : Sun;
    return (
      <button
        onClick={() => setTheme(next)}
        aria-label={`Switch to ${next} mode`}
        className="grid size-8 place-items-center rounded-lg text-fg/75 transition hover:bg-white/[0.06] hover:text-fg"
      >
        <Icon className="size-4" />
      </button>
    );
  }

  return (
    <div role="radiogroup" aria-label="Appearance" className="grid grid-cols-2 gap-0.5 rounded-lg border border-line bg-white/[0.02] p-0.5">
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          role="radio"
          aria-checked={theme === value}
          onClick={() => setTheme(value)}
          className={cn(
            "flex h-7 items-center justify-center gap-1.5 rounded-md text-[13px] font-medium transition",
            theme === value ? "bg-white/[0.08] text-fg" : "text-fg/60 hover:text-fg",
          )}
        >
          <Icon className="size-3.5" /> {label}
        </button>
      ))}
    </div>
  );
}
