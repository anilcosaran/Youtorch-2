"use client";

import { useState } from "react";
import { formatUsd } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ChartTooltip } from "./chart-tooltip";
import { chartAccent, type BarDatum } from "./constants";

export function BarChart({
  data,
  height = 220,
  format = formatUsd,
  accent = chartAccent,
  className,
}: {
  data: BarDatum[];
  /** Pixel height of the plot, or "fill" to stretch inside a flex column. */
  height?: number | "fill";
  format?: (value: number) => string;
  accent?: string;
  className?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const fill = height === "fill";
  const totals = data.map((d) => d.segments.reduce((s, x) => s + x.value, 0));
  const max = Math.max(...totals, 0);
  const n = data.length;
  const inset = n > 45 ? "px-[1px]" : n > 20 ? "px-[16%]" : "px-[24%]";
  const ticks = [...new Set([0, Math.floor((n - 1) / 2), n - 1])].filter((i) => i >= 0 && i < n);

  return (
    <div className={cn("relative pt-6 select-none", fill && "flex min-h-60 flex-1 flex-col", className)}>
      <div className={cn("relative", fill && "flex-1")} style={fill ? undefined : { height }} onMouseLeave={() => setHover(null)}>
        {max > 0 && (
          <>
            <span className="absolute -top-0.5 left-0 -translate-y-full text-[12px] font-medium tabular" style={{ color: accent }}>
              {format(max)}
            </span>
            <span className="absolute inset-x-0 top-0 border-t border-dashed border-white/20" />
            <span className="absolute inset-x-0 top-1/3 border-t border-dashed border-white/[0.06]" />
            <span className="absolute inset-x-0 top-2/3 border-t border-dashed border-white/[0.06]" />
          </>
        )}
        <span className="absolute inset-x-0 bottom-0 border-t border-white/10" />

        <div className="absolute inset-0 flex">
          {data.map((d, i) => (
            <div key={d.label} onMouseEnter={() => setHover(i)} className="relative flex h-full flex-1 items-end">
              <span className={cn("absolute inset-0 transition-colors", hover === i ? "bg-white/[0.05]" : "bg-transparent")} />
              <div className={cn("relative flex h-full w-full items-end", inset)}>
                {totals[i] > 0 ? (
                  <div
                    className={cn(
                      "flex w-full origin-bottom animate-rise flex-col-reverse overflow-hidden rounded-t-[3px] transition-[height,opacity] duration-500 ease-out",
                      hover !== null && hover !== i && "opacity-45",
                    )}
                    style={{ height: `${Math.max(1.5, (totals[i] / max) * 100)}%`, animationDelay: `${(i / n) * 320}ms` }}
                  >
                    {d.segments.map((s) =>
                      s.value > 0 ? <span key={s.key} style={{ height: `${(s.value / totals[i]) * 100}%`, background: s.color }} /> : null,
                    )}
                  </div>
                ) : (
                  <span className="h-[2px] w-full bg-white/25" />
                )}
              </div>
            </div>
          ))}
        </div>

        {hover !== null && <ChartTooltip datum={data[hover]} total={totals[hover]} index={hover} count={n} format={format} />}
      </div>

      <div className="relative mt-2.5 h-4 text-[12px] text-subtle">
        {ticks.map((i) => (
          <span key={i} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${((i + 0.5) / n) * 100}%` }}>
            {data[i].label}
          </span>
        ))}
      </div>
    </div>
  );
}
