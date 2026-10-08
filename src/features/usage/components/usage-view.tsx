"use client";

import { useState } from "react";
import { Database, Download, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Select } from "@/components/ui/select";
import { modalityLabel, modalityOrder } from "@/lib/modality";
import { requestShare, usageSeries } from "@/mocks/usage";
import { useConsole } from "@/providers/console-provider";
import type { Modality } from "@/types/model";
import type { DailyUsage } from "@/types/usage";
import { sum } from "../lib/metrics";
import { DailySpendChart } from "./daily-spend-chart";
import { ModalityBreakdown } from "./modality-breakdown";
import { RequestTable } from "./request-table";
import { UsageKpis } from "./usage-kpis";
import { BudgetCard, ModalityMixCard, TopKeysCard } from "./usage-side-cards";

type Period = "7" | "14" | "30" | "90";

const periodOptions: { value: Period; label: string }[] = [
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

const scopeOptions = [{ value: "all" as const, label: "All models" }, ...modalityOrder.map((m) => ({ value: m, label: modalityLabel[m] }))];

const sampleKeyShare = [
  { name: "production-backend", share: 0.71 },
  { name: "render-worker", share: 0.24 },
  { name: "local-dev", share: 0.05 },
];

export function UsageView() {
  const { sampleMode, setSampleMode, keys } = useConsole();
  const [period, setPeriod] = useState<Period>("14");
  const [scope, setScope] = useState<"all" | Modality>("all");

  const days = Number(period);
  const series = usageSeries.slice(-days);
  const previous = usageSeries.slice(-2 * days, -days);
  const scoped = scope === "all" ? modalityOrder : [scope];
  // Without sample data every metric reads as zero so the layout stays visible.
  const live = (value: number) => (sampleMode ? value : 0);

  const spendFor = (d: DailyUsage, m: Modality) => live(d.spend[m]);
  const requestsFor = (d: DailyUsage, m: Modality) => live(Math.round(d.requests * requestShare[m]));
  const spendOf = (d: DailyUsage) => scoped.reduce((s, m) => s + spendFor(d, m), 0);
  const requestsOf = (d: DailyUsage) => live(Math.round(d.requests * scoped.reduce((s, m) => s + requestShare[m], 0)));

  const totalRequests = sum(series, requestsOf);
  const weekSpend = sum(usageSeries.slice(-7), spendOf);
  const mix = scoped
    .map((modality) => ({ modality, value: series.reduce((s, d) => s + spendFor(d, modality), 0) }))
    .sort((a, b) => b.value - a.value);
  const topKeys = keys.length
    ? keys.map((k, i) => ({ name: k.name, requests: live(Math.round(totalRequests * (0.6 / (i + 1)))) }))
    : sampleMode
      ? sampleKeyShare.map((k) => ({ name: k.name, requests: Math.round(totalRequests * k.share) }))
      : [];

  return (
    <>
      <PageHeader
        eyebrow="Build"
        title="Usage & logs"
        description={
          sampleMode ? (
            "Spend, requests and reliability across every key and model."
          ) : (
            <>
              No usage in this period yet.{" "}
              <button onClick={() => setSampleMode(true)} className="font-medium text-fg underline-offset-4 hover:underline">
                Preview with sample data
              </button>
            </>
          )
        }
        actions={
          <>
            <Select value={scope} onChange={setScope} options={scopeOptions} />
            <Select value={period} onChange={setPeriod} options={periodOptions} />
            <Button
              variant="ghost"
              size="icon"
              aria-label={sampleMode ? "Hide sample data" : "Show sample data"}
              onClick={() => setSampleMode(!sampleMode)}
            >
              {sampleMode ? <EyeOff /> : <Database />}
            </Button>
            <Button variant="ghost" size="icon" aria-label="Export CSV">
              <Download />
            </Button>
          </>
        }
      />

      <UsageKpis
        days={series}
        previous={previous}
        spendOf={spendOf}
        requestsOf={requestsOf}
        caption={`Last ${period} days`}
        replayKey={`${period}-${scope}-${sampleMode}`}
      />

      <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_340px]">
        <DailySpendChart
          series={series}
          modalities={scoped}
          scopeLabel={scope === "all" ? "All models" : modalityLabel[scope]}
          spendOf={spendOf}
          spendFor={spendFor}
        />
        <div className="grid content-start gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <BudgetCard spent={weekSpend} />
          <ModalityMixCard mix={mix} />
          <TopKeysCard keys={topKeys} />
        </div>
      </div>

      <ModalityBreakdown series={series} scope={scope} onScope={setScope} spendFor={spendFor} requestsFor={requestsFor} />

      <section className="mt-10">
        <SectionHeader title="Request log" description="Most recent first. Retained for 30 days." />
        {sampleMode ? (
          <RequestTable />
        ) : (
          <div className="grid min-h-32 place-items-center surface p-6 text-[14px] text-subtle">
            Logs appear here as soon as your first request completes.
          </div>
        )}
      </section>
    </>
  );
}
