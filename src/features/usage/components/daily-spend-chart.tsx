"use client";

import { useState } from "react";
import { BarChart } from "@/components/charts/bar-chart";
import { ChartLegend } from "@/components/charts/chart-legend";
import { chartAccent, type BarDatum } from "@/components/charts/constants";
import { Segmented } from "@/components/ui/segmented";
import { formatUsd } from "@/lib/format";
import { modalityColors, modalityLabel } from "@/lib/modality";
import type { Modality } from "@/types/model";
import type { DailyUsage } from "@/types/usage";
import type { DayMetric } from "../lib/metrics";

export function DailySpendChart({
  series,
  modalities,
  scopeLabel,
  spendOf,
  spendFor,
}: {
  series: DailyUsage[];
  modalities: Modality[];
  scopeLabel: string;
  spendOf: DayMetric;
  spendFor: (day: DailyUsage, modality: Modality) => number;
}) {
  const [groupBy, setGroupBy] = useState<"total" | "modality">("total");
  const average = series.reduce((s, d) => s + spendOf(d), 0) / series.length;

  const data: BarDatum[] = series.map((d) => ({
    label: d.label,
    tooltip: d.date,
    segments:
      groupBy === "total"
        ? [{ key: "all", label: scopeLabel, value: spendOf(d), color: chartAccent }]
        : modalities.map((m) => ({ key: m, label: modalityLabel[m], value: spendFor(d, m), color: modalityColors[m] })),
  }));

  return (
    <section className="flex flex-col surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Daily spend</p>
          <p className="mt-2 text-[28px] leading-none font-semibold tracking-tight text-fg tabular">
            {formatUsd(average)}
            <span className="ml-1.5 text-[14px] font-medium tracking-normal text-subtle">avg / day</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-muted">Group by</span>
          <Segmented
            size="sm"
            value={groupBy}
            onChange={setGroupBy}
            options={[
              { value: "total", label: "Total" },
              { value: "modality", label: "Modality" },
            ]}
          />
        </div>
      </div>
      {groupBy === "modality" && (
        <div className="mt-3">
          <ChartLegend items={modalities.map((m) => ({ label: modalityLabel[m], color: modalityColors[m] }))} />
        </div>
      )}
      <BarChart data={data} height="fill" className="mt-4" />
    </section>
  );
}
