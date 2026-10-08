"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";
import { smoothPath } from "./smooth-path";

export function Sparkline({
  values,
  color = "var(--color-ember-400)",
  height = 44,
  area = false,
  animate = false,
  className,
}: {
  values: number[];
  color?: string;
  height?: number;
  area?: boolean;
  /** Draw the line in on mount; remount (via key) to replay. */
  animate?: boolean;
  className?: string;
}) {
  const gradientId = useId();
  const max = Math.max(...values);
  const min = Math.min(...values);
  const flat = max === min;
  const pad = 4;
  const y = (v: number) => (flat ? height - pad : height - pad - ((v - min) / (max - min)) * (height - pad * 2));
  const points = values.map((v, i) => [(i / Math.max(values.length - 1, 1)) * 100, y(v)] as [number, number]);
  const lastY = points.at(-1)?.[1] ?? height - pad;

  return (
    <div className={cn("relative w-full", className)} style={{ height }}>
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className={cn("absolute inset-0 size-full overflow-visible", animate && "animate-reveal")}
      >
        {area && !flat && (
          <>
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.28" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`${smoothPath(points)} L100,${height} L0,${height} Z`} fill={`url(#${gradientId})`} />
          </>
        )}
        <path
          d={smoothPath(points)}
          fill="none"
          stroke={flat ? "var(--color-line-strong)" : color}
          strokeWidth="1.75"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
        />
      </svg>
      <span
        className={cn("absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface", animate && "animate-fade-in")}
        style={{
          left: "100%",
          top: lastY,
          background: flat ? "var(--color-line-strong)" : color,
          animationDelay: animate ? "900ms" : undefined,
        }}
      />
    </div>
  );
}
