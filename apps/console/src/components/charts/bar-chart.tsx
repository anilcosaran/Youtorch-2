"use client";

import { useState } from "react";
import { formatUsd } from "@/lib/format";
import { cn } from "@/lib/cn";
import { XLabels, YGrid } from "./chart-axes";
import { ChartTooltip } from "./chart-tooltip";
import type { BarDatum } from "./constants";
import { axisLabel, labelIndices, labelWidth, niceTicks } from "./scale";
import { useChartFrame } from "./use-chart-frame";

const PAD_TOP = 8;
const AXIS = 26;

export function BarChart({
  data,
  height = 220,
  format = formatUsd,
  highlight = null,
  className,
}: {
  data: BarDatum[];
  /** Pixel height of the chart including the date axis, or "fill" to stretch inside a flex column. */
  height?: number | "fill";
  format?: (value: number) => string;
  /** Segment key to keep at full strength while the other segments fade back. */
  highlight?: string | null;
  className?: string;
}) {
  const [ref, frame] = useChartFrame<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const fill = height === "fill";
  const { width, snapX, snapY, hairline } = frame;
  const boxHeight = fill ? frame.height : height;

  const totals = data.map((d) => d.segments.reduce((s, x) => s + x.value, 0));
  const n = data.length;
  const baseline = boxHeight - AXIS;
  const ticks = niceTicks(Math.max(...totals, 0), baseline - PAD_TOP < 150 ? 3 : 4);
  const ceiling = ticks.at(-1) || 1;
  const label = axisLabel(format);
  const left = Math.ceil(labelWidth(ticks.map(label))) + 12;
  const slot = (width - left) / Math.max(n, 1);
  const gap = Math.min(8, Math.max(1, Math.round(slot * 0.1)));
  const y = (v: number) => baseline - (v / ceiling) * (baseline - PAD_TOP);
  const center = (i: number) => left + (i + 0.5) * slot;

  return (
    <div className={cn("relative select-none", fill && "flex min-h-60 flex-1 flex-col", className)}>
      <div ref={ref} className={cn("relative", fill && "flex-1")} style={fill ? undefined : { height }} onMouseLeave={() => setHover(null)}>
        {width > 0 && n > 0 && (
          <svg width={width} height={boxHeight} className="absolute inset-0 overflow-visible">
            <YGrid frame={frame} ticks={ticks} y={y} left={left} right={width} label={label} />

            {hover !== null && (
              <rect
                x={snapX(left + hover * slot)}
                width={snapX(left + (hover + 1) * slot) - snapX(left + hover * slot)}
                y={PAD_TOP}
                height={baseline - PAD_TOP}
                fill="var(--color-white)"
                fillOpacity={0.04}
              />
            )}

            {data.map((d, i) => {
              const barWidth = slot - gap;
              const x0 = snapX(center(i) - barWidth / 2);
              const w = Math.max(1, snapX(center(i) + barWidth / 2) - x0);
              const bottom = snapY(baseline);
              if (totals[i] <= 0) {
                return <rect key={d.label} x={x0} y={bottom - 2} width={w} height={2} fill="var(--color-white)" fillOpacity={0.2} />;
              }
              const top = Math.min(snapY(y(totals[i])), bottom - 2);
              const visible = d.segments.filter((s) => s.value > 0);
              let acc = 0;
              let prev = bottom;
              return (
                <g
                  key={d.label}
                  className={cn("animate-rise transition-opacity duration-200", hover !== null && hover !== i && "opacity-45")}
                  style={{ transformOrigin: `0 ${bottom}px`, animationDelay: `${(i / n) * 320}ms` }}
                >
                  {visible.map((s, k) => {
                    acc += s.value;
                    const last = k === visible.length - 1;
                    const segTop = last ? top : Math.max(top, snapY(y(acc)));
                    // Stacked segments sit one hairline apart so neighbouring colors stay distinct.
                    const h = prev - segTop - (k > 0 ? hairline : 0);
                    prev = segTop;
                    if (h <= 0) return null;
                    const props = {
                      fill: s.color,
                      className: "transition-opacity duration-200",
                      opacity: highlight && s.key !== highlight ? 0.22 : 1,
                    };
                    return last ? (
                      <path key={s.key} d={roundedTop(x0, segTop, w, h, 2)} {...props} />
                    ) : (
                      <rect key={s.key} x={x0} y={segTop} width={w} height={h} {...props} />
                    );
                  })}
                </g>
              );
            })}

            <XLabels
              labels={data.map((d) => d.label)}
              indices={labelIndices(n, slot)}
              x={center}
              y={baseline + 18}
              left={left}
              right={width}
            />

            {data.map((d, i) => (
              <rect
                key={d.label}
                x={left + i * slot}
                width={slot}
                y={0}
                height={baseline}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            ))}
          </svg>
        )}

        {hover !== null && (
          <ChartTooltip datum={data[hover]} total={totals[hover]} x={center(hover)} flip={center(hover) > width / 2} format={format} />
        )}
      </div>
    </div>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, radius: number) {
  const r = Math.min(radius, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
