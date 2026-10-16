"use client";

import { useId } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { compact, integer } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The keys of `T` whose values are of type `V`. */
export type KeysOfType<T, V> = { [K in keyof T]-?: T[K] extends V ? K : never }[keyof T] & string;

export interface SeriesSpec<K extends string> {
  key: K;
  label: string;
  /** CSS colour, normally a `--series-*` or `--status-*` token. */
  color: string;
}

const AXIS_TICK = { fontSize: 12, fill: "var(--chart-axis)" };

interface TooltipEntry {
  dataKey?: unknown;
  value?: unknown;
}

function SeriesTooltip({
  active,
  payload,
  label,
  series,
  labelFormat,
  valueFormat,
  showTotal,
}: {
  active?: boolean;
  payload?: readonly TooltipEntry[];
  label?: unknown;
  series: SeriesSpec<string>[];
  labelFormat: (value: string) => string;
  valueFormat: (n: number) => string;
  showTotal: boolean;
}) {
  if (!active || !payload?.length) return null;
  const valueOf = (key: string) => Number(payload.find((p) => p.dataKey === key)?.value ?? 0);
  const total = series.reduce((sum, s) => sum + valueOf(s.key), 0);
  return (
    <div className="min-w-44 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="mb-1.5 font-medium">{labelFormat(String(label))}</div>
      <ul className="grid gap-1">
        {[...series].reverse().map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="ml-auto pl-4 font-medium tabular">{valueFormat(valueOf(s.key))}</span>
          </li>
        ))}
      </ul>
      {showTotal && (
        <div className="mt-1.5 flex items-center border-t pt-1.5">
          <span className="text-muted-foreground">Total</span>
          <span className="ml-auto pl-4 font-medium tabular">{valueFormat(total)}</span>
        </div>
      )}
    </div>
  );
}

/** Series names with their colour; with `totals`, the sum over the range too. */
function SeriesLegend<T>({
  data,
  series,
  totals,
  valueFormat = integer,
}: {
  data: readonly T[];
  series: SeriesSpec<KeysOfType<T, number>>[];
  totals: boolean;
  valueFormat?: (n: number) => string;
}) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} aria-hidden />
          <span className="text-muted-foreground">{s.label}</span>
          {totals && (
            <span className="font-medium tabular">
              {valueFormat(data.reduce((sum, row) => sum + Number(row[s.key]), 0))}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Lines, washed areas or columns over time. One y-axis, light dashed
 * gridlines, compact ticks and a tooltip that lists every series.
 */
export function TimeSeriesChart<T>({
  data,
  x,
  series,
  variant = "line",
  stacked = false,
  height = 220,
  tickFormat,
  labelFormat,
  valueFormat = integer,
  legend = "none",
  className,
}: {
  data: readonly T[];
  x: KeysOfType<T, string>;
  series: SeriesSpec<KeysOfType<T, number>>[];
  variant?: "line" | "area" | "bar";
  stacked?: boolean;
  height?: number;
  tickFormat: (value: string) => string;
  labelFormat: (value: string) => string;
  valueFormat?: (n: number) => string;
  /** "totals" adds the sum over the range; use it for counts, not for levels like active users. */
  legend?: "none" | "plain" | "totals";
  className?: string;
}) {
  const stackId = stacked ? "stack" : undefined;
  // Gradient IDs must be unique on the page, not just within the chart.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {legend !== "none" && (
        <SeriesLegend data={data} series={series} totals={legend === "totals"} valueFormat={valueFormat} />
      )}
      <ComposedChart
        responsive
        data={data as T[]}
        style={{ width: "100%", height }}
        margin={{ top: 6, right: 4, bottom: 0, left: 0 }}
        barCategoryGap="20%"
      >
        <defs>
          {variant === "area" &&
            series.map((s) => (
              <linearGradient key={s.key} id={`${uid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.18} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
        </defs>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
        <XAxis
          dataKey={x}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={28}
          tick={AXIS_TICK}
          tickFormatter={(value) => tickFormat(String(value))}
        />
        <YAxis
          width={40}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
          tick={AXIS_TICK}
          tickFormatter={(value) => compact(Number(value))}
        />
        <Tooltip
          cursor={
            variant === "bar"
              ? { fill: "var(--muted)", opacity: 0.5 }
              : { stroke: "var(--chart-axis)", strokeDasharray: "3 3" }
          }
          content={(props) => (
            <SeriesTooltip
              active={props.active}
              payload={props.payload}
              label={props.label}
              series={series}
              labelFormat={labelFormat}
              valueFormat={valueFormat}
              showTotal={stacked && series.length > 1}
            />
          )}
        />
        {series.map((s, i) => {
          if (variant === "bar") {
            const top = !stacked || i === series.length - 1;
            return (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId={stackId}
                fill={s.color}
                maxBarSize={24}
                radius={top ? [3, 3, 0, 0] : 0}
                stroke="var(--card)"
                strokeWidth={stacked ? 1 : 0}
                isAnimationActive={false}
              />
            );
          }
          if (variant === "area") {
            return (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stackId={stackId}
                stroke={s.color}
                strokeWidth={2}
                fill={`url(#${uid}-${s.key})`}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                isAnimationActive={false}
              />
            );
          }
          return (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
              isAnimationActive={false}
            />
          );
        })}
      </ComposedChart>
    </div>
  );
}
