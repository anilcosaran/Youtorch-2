"use client";

import { useState } from "react";
import Link from "next/link";
import { BarChart } from "@/components/charts/bar-chart";
import { chartAccent, type BarDatum } from "@/components/charts/constants";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";
import { formatUsd } from "@/lib/format";
import { modalityColors, modalityLabel } from "@/lib/modality";
import { models } from "@/mocks/models";
import type { Modality } from "@/types/model";
import type { DailyUsage } from "@/types/usage";
import { otherColor, rowTotal, seriesPalette, splitByShare, type BreakdownRow, type Dimension, type Metric } from "../lib/breakdown";
import type { DayMetric } from "../lib/metrics";

type View = "total" | Dimension;

const OTHER = "other";
const COLLAPSED_ROWS = 8;
const HEIGHT = 280;

const views: { value: View; label: string }[] = [
  { value: "total", label: "Total" },
  { value: "model", label: "Model" },
  { value: "modality", label: "Modality" },
  { value: "key", label: "API key" },
];

const nouns: Record<Dimension, [string, string]> = {
  model: ["model", "models"],
  modality: ["modality", "modalities"],
  key: ["key", "keys"],
};

const metrics: { value: Metric; label: string }[] = [
  { value: "spend", label: "Spend" },
  { value: "requests", label: "Requests" },
];

const formatCount = (v: number) => Math.round(v).toLocaleString("en-US");

interface UsageSource {
  series: DailyUsage[];
  /** Modalities in the current scope; models outside them are left out. */
  modalities: Modality[];
  live: (value: number) => number;
  spendOf: DayMetric;
  requestsOf: DayMetric;
  spendFor: (day: DailyUsage, modality: Modality) => number;
  requestsFor: (day: DailyUsage, modality: Modality) => number;
  keyShares: { name: string; share: number }[];
}

export function UsageChart({
  scopeLabel,
  onScope,
  ...source
}: UsageSource & {
  scopeLabel: string;
  onScope: (modality: Modality) => void;
}) {
  const { series } = source;
  const [view, setView] = useState<View>("model");
  const [metric, setMetric] = useState<Metric>("spend");
  const [highlight, setHighlight] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const format = metric === "spend" ? formatUsd : formatCount;
  const daily = series.map((d) => (metric === "spend" ? source.spendOf(d) : source.requestsOf(d)));
  const total = daily.reduce((s, v) => s + v, 0);
  const metricLabel = metric === "spend" ? "Spend" : "Requests";

  return (
    <section className="mt-3 surface">
      <div className="p-5 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">{view === "total" ? `Daily ${metric}` : `${metricLabel} by ${nouns[view][0]}`}</p>
            <p className="mt-2 text-[28px] leading-none font-semibold tracking-tight text-fg tabular">
              {format(total)}
              <span className="ml-1.5 text-[14px] font-medium tracking-normal text-subtle">
                {view === "total" ? `avg ${format(total / Math.max(1, series.length))} / day` : null}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              size="sm"
              value={view}
              onChange={(v) => {
                setView(v);
                setHighlight(null);
              }}
              options={views}
            />
            <Segmented size="sm" value={metric} onChange={setMetric} options={metrics} />
          </div>
        </div>

        {view === "total" && (
          <BarChart
            height={HEIGHT}
            format={format}
            className="mt-6"
            data={series.map((d, i) => ({
              label: d.label,
              tooltip: d.date,
              segments: [{ key: "all", label: scopeLabel, value: daily[i], color: chartAccent }],
            }))}
          />
        )}
      </div>

      {view !== "total" && (
        <Breakdown
          dimension={view}
          metric={metric}
          source={source}
          format={format}
          highlight={highlight}
          onHighlight={setHighlight}
          expanded={expanded}
          onExpand={setExpanded}
          onScope={onScope}
        />
      )}
    </section>
  );
}

function Breakdown({
  dimension,
  metric,
  source,
  format,
  highlight,
  onHighlight,
  expanded,
  onExpand,
  onScope,
}: {
  dimension: Dimension;
  metric: Metric;
  source: UsageSource;
  format: (value: number) => string;
  highlight: string | null;
  onHighlight: (key: string | null) => void;
  expanded: boolean;
  onExpand: (expanded: boolean) => void;
  onScope: (modality: Modality) => void;
}) {
  const { series } = source;
  const noun = nouns[dimension];
  const rows = buildRows(dimension, source)
    .map((row) => ({ ...row, total: rowTotal(row, metric) }))
    .filter((row) => row.total > 0 || row.requests.some((v) => v > 0))
    .sort((a, b) => b.total - a.total);

  // Up to seven colors stay distinguishable; past that the tail folds into "Other".
  const topCount = rows.length > 7 ? 6 : rows.length;
  const colorOf = (row: BreakdownRow, rank: number) =>
    rank < topCount ? (row.color ?? seriesPalette[rank % seriesPalette.length]) : otherColor;
  const rest = rows.slice(topCount);
  const otherLabel = `${rest.length} other ${rest.length === 1 ? noun[0] : noun[1]}`;

  // Largest first, so it sits at the bottom of every stack and leads the tooltip.
  const data: BarDatum[] = series.map((d, i) => ({
    label: d.label,
    tooltip: d.date,
    segments: [
      ...rows.slice(0, topCount).map((row, rank) => ({ key: row.key, label: row.label, value: row[metric][i], color: colorOf(row, rank) })),
      ...(rest.length ? [{ key: OTHER, label: otherLabel, value: rest.reduce((s, row) => s + row[metric][i], 0), color: otherColor }] : []),
    ],
  }));

  const grandTotal = rows.reduce((s, row) => s + row.total, 0);
  const visibleRows = expanded ? rows : rows.slice(0, COLLAPSED_ROWS);

  return (
    <>
      <div className="px-5 pb-3">
        <BarChart key={`${dimension}-${metric}`} data={data} format={format} highlight={highlight} height={HEIGHT} className="mt-6" />
      </div>

      {rows.length ? (
        <table className="w-full text-left text-[14px]">
          <thead>
            <tr className="border-y border-line font-mono text-[11px] tracking-[0.14em] text-subtle uppercase">
              <th className="px-5 py-2.5 font-normal">
                {noun[0]} · {rows.length}
              </th>
              <th className="px-4 py-2.5 text-right font-normal">Requests</th>
              <th className="px-4 py-2.5 text-right font-normal">Spend</th>
              <th className="hidden w-[28%] px-5 py-2.5 font-normal sm:table-cell">Share of {metric}</th>
            </tr>
          </thead>
          <tbody onMouseLeave={() => onHighlight(null)}>
            {visibleRows.map((row) => {
              const rank = rows.indexOf(row);
              const color = colorOf(row, rank);
              const share = grandTotal > 0 ? row.total / grandTotal : 0;
              return (
                <tr
                  key={row.key}
                  onMouseEnter={() => onHighlight(rank < topCount ? row.key : OTHER)}
                  className="border-b border-line transition last:border-0 hover:bg-white/[0.02]"
                >
                  <td className="px-5 py-2.5">
                    <span className="flex items-center gap-2.5">
                      <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: color }} />
                      <RowLabel row={row} dimension={dimension} onScope={onScope} />
                      {row.detail && <span className="text-[12px] text-subtle">{row.detail}</span>}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted tabular">{formatCount(sumOf(row.requests))}</td>
                  <td className="px-4 py-2.5 text-right font-medium tabular">{formatUsd(sumOf(row.spend))}</td>
                  <td className="hidden px-5 py-2.5 sm:table-cell">
                    <span className="flex items-center gap-3">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                        <span
                          className="block h-full rounded-full transition-[width] duration-500"
                          style={{ width: `${share * 100}%`, background: color }}
                        />
                      </span>
                      <span className="w-10 text-right text-[13px] text-muted tabular">{Math.round(share * 100)}%</span>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="border-t border-line px-5 py-6 text-[14px] text-subtle">Usage per {noun[0]} appears here once requests come in.</p>
      )}

      {rows.length > COLLAPSED_ROWS && (
        <button
          onClick={() => onExpand(!expanded)}
          className="w-full border-t border-line py-2.5 text-[13px] font-medium text-muted transition hover:text-fg"
        >
          {expanded ? "Show less" : `Show all ${rows.length} ${noun[1]}`}
        </button>
      )}
    </>
  );
}

function RowLabel({ row, dimension, onScope }: { row: BreakdownRow; dimension: Dimension; onScope: (m: Modality) => void }) {
  const className = "truncate font-medium hover:underline underline-offset-4";
  if (row.href) {
    return (
      <Link href={row.href} className={className}>
        {row.label}
      </Link>
    );
  }
  if (dimension === "modality") {
    return (
      <button onClick={() => onScope(row.key as Modality)} className={cn(className, "text-left")}>
        {row.label}
      </button>
    );
  }
  return <span className="truncate font-medium">{row.label}</span>;
}

const sumOf = (values: number[]) => values.reduce((s, v) => s + v, 0);

function buildRows(dimension: Dimension, source: UsageSource): BreakdownRow[] {
  const { series, modalities, live } = source;
  if (dimension === "modality") {
    return modalities.map((m) => ({
      key: m,
      label: modalityLabel[m],
      color: modalityColors[m],
      spend: series.map((d) => source.spendFor(d, m)),
      requests: series.map((d) => source.requestsFor(d, m)),
    }));
  }
  if (dimension === "key") {
    const shares = source.keyShares.map((k) => k.share);
    const spend = series.map((d) => splitByShare(d, source.spendOf(d), shares, false));
    const requests = series.map((d) => splitByShare(d, source.requestsOf(d), shares, true));
    return source.keyShares.map((k, i) => ({
      key: k.name,
      label: k.name,
      spend: spend.map((day) => day[i]),
      requests: requests.map((day) => day[i]),
    }));
  }
  return models
    .filter((model) => modalities.includes(model.modality))
    .map((model) => ({
      key: model.slug,
      label: model.name,
      detail: modalityLabel[model.modality],
      href: `/models/${model.slug}`,
      spend: series.map((d) => live(d.models[model.slug]?.spend ?? 0)),
      requests: series.map((d) => live(d.models[model.slug]?.requests ?? 0)),
    }));
}
