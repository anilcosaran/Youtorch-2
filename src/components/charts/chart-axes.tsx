import type { ChartFrame } from "./use-chart-frame";

/** Horizontal grid lines with value labels in the left gutter; the zero line is the baseline. */
export function YGrid({
  frame,
  ticks,
  y,
  left,
  right,
  label,
}: {
  frame: ChartFrame;
  ticks: number[];
  y: (value: number) => number;
  left: number;
  right: number;
  label: (value: number) => string;
}) {
  const { hairline, snapY } = frame;
  return (
    <g>
      {ticks.map((t) => {
        const py = snapY(y(t)) + (t === 0 ? -hairline / 2 : hairline / 2);
        return (
          <g key={t}>
            <line
              x1={left}
              x2={right}
              y1={py}
              y2={py}
              stroke={t === 0 ? "var(--color-line-strong)" : "var(--color-line-soft)"}
              strokeWidth={hairline}
            />
            <text x={left - 8} y={y(t)} dy="0.35em" textAnchor="end" className="fill-subtle text-[11px] tabular">
              {label(t)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** Date labels centred under their slot, pinned inside the plot at both ends. */
export function XLabels({
  labels,
  indices,
  x,
  y,
  left,
  right,
}: {
  labels: string[];
  indices: number[];
  x: (index: number) => number;
  y: number;
  left: number;
  right: number;
}) {
  const half = 22;
  return (
    <g>
      {indices.map((i) => {
        const cx = x(i);
        const anchor = cx + half > right ? "end" : cx - half < left ? "start" : "middle";
        const tx = anchor === "end" ? right : anchor === "start" ? left : cx;
        return (
          <text key={i} x={tx} y={y} textAnchor={anchor} className="fill-subtle text-[12px]">
            {labels[i]}
          </text>
        );
      })}
    </g>
  );
}
