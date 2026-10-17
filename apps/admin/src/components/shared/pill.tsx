import { cn } from "@/lib/utils";

export type Tone = "neutral" | "good" | "warning" | "serious" | "critical" | "info";

const TONE_COLOR: Record<Tone, string> = {
  neutral: "var(--muted-foreground)",
  good: "var(--status-good)",
  warning: "var(--status-warning)",
  serious: "var(--status-serious)",
  critical: "var(--status-critical)",
  info: "var(--series-1)",
};

/**
 * A small state label. The dot and a faint wash carry the colour; the text
 * stays in the regular ink so it reads on any surface.
 */
export function Pill({
  tone = "neutral",
  children,
  className,
  title,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  const color = TONE_COLOR[tone];
  return (
    <span
      title={title}
      style={{ background: `color-mix(in oklch, ${color} 18%, transparent)` }}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap text-foreground",
        className,
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      {children}
    </span>
  );
}
