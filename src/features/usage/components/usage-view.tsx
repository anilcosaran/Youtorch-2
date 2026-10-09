"use client";

import { useState } from "react";
import Link from "next/link";
import { Database, Download, EyeOff, Terminal } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Select } from "@/components/ui/select";
import { modalityLabel, modalityOrder } from "@/lib/modality";
import { monthlyBudget, requestShare, totalSpend, usageSeries } from "@/mocks/usage";
import { useConsole } from "@/providers/console-provider";
import type { Modality } from "@/types/model";
import type { DailyUsage } from "@/types/usage";
import { RequestTable } from "./request-table";
import { UsageChart } from "./usage-chart";
import { UsageKpis } from "./usage-kpis";

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
  const requestsOf = (d: DailyUsage) => scoped.reduce((s, m) => s + requestsFor(d, m), 0);

  // The budget is workspace-wide, so it ignores the modality scope.
  const monthToDate = live(usageSeries.slice(-7).reduce((s, d) => s + totalSpend(d), 0));
  const keyShares = keys.length ? keys.map((k, i) => ({ name: k.name, share: 0.6 / (i + 1) })) : sampleKeyShare;

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
        budget={{ label: "October budget", spent: monthToDate, limit: monthlyBudget }}
        replayKey={`${period}-${scope}-${sampleMode}`}
      />

      <UsageChart
        scopeLabel={scope === "all" ? "All models" : modalityLabel[scope]}
        series={series}
        modalities={scoped}
        live={live}
        spendOf={spendOf}
        requestsOf={requestsOf}
        spendFor={spendFor}
        requestsFor={requestsFor}
        keyShares={keyShares}
        onScope={setScope}
      />

      <section className="mt-10">
        <SectionHeader
          title={
            <span className="inline-flex items-center gap-2.5">
              Request log
              {sampleMode && (
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ok">
                  <span className="size-1.5 animate-pulse-soft rounded-full bg-ok" /> Live
                </span>
              )}
            </span>
          }
          description="Live tail of every call made with your keys, most recent first. Retained for 30 days."
        />
        {sampleMode ? (
          <RequestTable />
        ) : (
          <EmptyState
            icon={<Terminal />}
            title="No requests yet"
            description="Requests show up here a few seconds after they hit the API."
            action={
              <div className="flex gap-2">
                <Link href="/quickstart" className={buttonClass({ variant: "primary", size: "sm" })}>
                  Make a request
                </Link>
                <Button variant="outline" size="sm" onClick={() => setSampleMode(true)}>
                  <Database /> Preview sample data
                </Button>
              </div>
            }
          />
        )}
      </section>
    </>
  );
}
