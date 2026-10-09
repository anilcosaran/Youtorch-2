import type { BarDatum } from "./constants";

/** Floating breakdown next to the hovered point; flips to the left on the right half. */
export function ChartTooltip({
  datum,
  total,
  x,
  flip,
  format,
}: {
  datum: BarDatum;
  total: number;
  /** Anchor in pixels from the left edge of the chart. */
  x: number;
  flip: boolean;
  format: (value: number) => string;
}) {
  return (
    <div
      className="pointer-events-none absolute top-[30%] z-10 min-w-44 rounded-lg border border-white/10 bg-tooltip px-3 py-2.5 text-[13px] shadow-2xl shadow-black/60"
      style={{ left: x, transform: flip ? "translateX(calc(-100% - 14px))" : "translateX(14px)" }}
    >
      <p className="mb-2 text-[12px] text-muted">{datum.tooltip ?? datum.label}</p>
      {datum.segments.map((s) => (
        <div key={s.key} className="flex items-center justify-between gap-6 py-0.5">
          <span className="flex min-w-0 items-center gap-2 text-fg">
            <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: s.color }} />
            <span className="truncate">{s.label}</span>
          </span>
          <span className="font-medium tabular">{format(s.value)}</span>
        </div>
      ))}
      {datum.segments.length > 1 && (
        <div className="mt-1.5 flex justify-between border-t border-white/10 pt-1.5 font-medium">
          <span>Total</span>
          <span className="tabular">{format(total)}</span>
        </div>
      )}
    </div>
  );
}
