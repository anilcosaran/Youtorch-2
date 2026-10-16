"use client";

import { useState } from "react";
import { Database } from "lucide-react";
import { BarChart } from "@/components/charts/bar-chart";
import { ChartLegend } from "@/components/charts/chart-legend";
import type { BarDatum } from "@/components/charts/constants";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";
import { formatUsd } from "@/lib/format";
import { modalityColors, modalityLabel, modalityOrder } from "@/lib/modality";
import { totalSpend, usageSeries } from "@/mocks/usage";
import { useConsole } from "@/providers/console-provider";

type Period = "7" | "30" | "90";

const periods = [
  { value: "7", label: "7D" },
  { value: "30", label: "30D" },
  { value: "90", label: "90D" },
] as const;

/** Share of gross spend returned as volume discounts and bonus credits. */
const DISCOUNT_RATE = 0.06;

export function SpendOverview() {
  const { sampleMode, setSampleMode } = useConsole();
  const [period, setPeriod] = useState<Period>("30");

  const series = usageSeries.slice(-Number(period));
  const bucket = period === "90" ? 3 : 1;
  const chartData: BarDatum[] = Array.from({ length: Math.ceil(series.length / bucket) }, (_, i) => {
    const days = series.slice(i * bucket, i * bucket + bucket);
    return {
      label: days[0].label,
      tooltip: bucket > 1 ? `${days[0].label} – ${days.at(-1)!.label}` : days[0].date,
      segments: modalityOrder.map((m) => ({
        key: m,
        label: modalityLabel[m],
        color: modalityColors[m],
        value: sampleMode ? days.reduce((s, d) => s + d.spend[m], 0) : 0,
      })),
    };
  });

  const gross = sampleMode ? series.reduce((s, d) => s + totalSpend(d), 0) : 0;
  const discounts = gross * DISCOUNT_RATE;
  const byModality = modalityOrder.map((m) => ({
    label: modalityLabel[m],
    color: modalityColors[m],
    value: formatUsd(sampleMode ? series.reduce((s, d) => s + d.spend[m], 0) : 0),
  }));

  return (
    <section className="mt-10">
      <SectionHeader
        title="Spend overview"
        description="Usage is drawn from your prepaid balance in real time."
        action={<Segmented value={period} onChange={setPeriod} options={periods} size="sm" />}
      />
      <div className="grid gap-3 md:grid-cols-3">
        <Kpi label="Current invoice due" value={formatUsd(0)} note="Prepaid workspaces are never invoiced" />
        <Kpi label={`Spend · last ${period} days`} value={formatUsd(gross - discounts)} note={`${formatUsd(gross)} before discounts`} />
        <Kpi label="Discounts saved" value={formatUsd(discounts)} note="Volume and bonus credits" accent />
      </div>
      <div className="mt-3 surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[15px] font-semibold">Spend by modality</p>
          {sampleMode ? (
            <ChartLegend items={byModality} />
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setSampleMode(true)}>
              <Database /> Preview sample data
            </Button>
          )}
        </div>
        <BarChart data={chartData} height={240} className="mt-4" />
      </div>
    </section>
  );
}

function Kpi({ label, value, note, accent }: { label: string; value: string; note: string; accent?: boolean }) {
  return (
    <div className="surface p-4">
      <p className="eyebrow">{label}</p>
      <p className={cn("mt-1.5 text-[26px] font-semibold tracking-tight tabular", accent && "text-jade-400")}>{value}</p>
      <p className="mt-0.5 text-[13px] text-subtle">{note}</p>
    </div>
  );
}
