import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/cn";

export function KpiCard({
  label,
  aside,
  value,
  caption,
  children,
}: {
  label: string;
  aside?: ReactNode;
  value: ReactNode;
  caption: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex min-h-[172px] flex-col surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow">{label}</span>
        {aside}
      </div>
      <div className="mt-3 text-[28px] leading-none font-semibold tracking-tight text-fg tabular">{value}</div>
      <div className="mt-1.5 text-[12.5px] text-muted">{caption}</div>
      <div className="mt-auto pt-4">{children}</div>
    </section>
  );
}

/** Period-over-period change. `better` decides whether a rise reads as good, bad or neutral. */
export function Delta({
  value,
  better = "higher",
  className,
}: {
  value?: number;
  better?: "higher" | "lower" | "neither";
  className?: string;
}) {
  if (value === undefined || !Number.isFinite(value)) return null;
  const up = value >= 0;
  const tone = better === "neither" ? "text-muted" : up === (better === "higher") ? "text-ok" : "text-down";
  return (
    <span className={cn("flex items-center gap-0.5 text-[12px] font-medium", tone, className)}>
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {Math.abs(value * 100).toFixed(1)}%
    </span>
  );
}
