"use client";

import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatUsd, splitUsd } from "@/lib/format";
import { useConsole } from "@/providers/console-provider";
import type { DailyUsage } from "@/types/usage";
import { buckets, change, errorRate, p50, sum, type DayMetric } from "../lib/metrics";
import { Delta, KpiCard } from "./kpi-card";

export function UsageKpis({
  days,
  previous,
  spendOf,
  requestsOf,
  caption,
  budget,
  replayKey,
}: {
  days: DailyUsage[];
  /** The window right before `days`, used for deltas; empty when there is no history. */
  previous: DailyUsage[];
  spendOf: DayMetric;
  requestsOf: DayMetric;
  caption: string;
  /** Workspace-wide month-to-date spend against the monthly budget. */
  budget: { label: string; spent: number; limit: number };
  /** Changing this replays the chart entrance. */
  replayKey: string;
}) {
  const { balance, autoReload, openDialog, sampleMode } = useConsole();
  const { whole, cents } = splitUsd(balance);
  const groups = buckets(days);
  const delta = (current: number, before: number) => (sampleMode && previous.length ? change(current, before) : undefined);

  const spend = sum(days, spendOf);
  const requests = sum(days, requestsOf);
  const success = 1 - errorRate(days);
  const errorRates = groups.map(errorRate);
  const peak = days.reduce<DailyUsage | undefined>((best, d) => (!best || requestsOf(d) > requestsOf(best) ? d : best), undefined);

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Balance"
        aside={
          <span className={cn("flex items-center gap-1 text-[12px] font-medium", autoReload.enabled ? "text-ok" : "text-subtle")}>
            <RefreshCw className="size-3" /> {autoReload.enabled ? "Auto reload on" : "Auto reload off"}
          </span>
        }
        value={
          <>
            {whole}
            <span className="text-white/40">.{cents}</span>
          </>
        }
        caption="Available credits"
      >
        <div className="flex gap-2">
          <Button variant="primary" size="sm" onClick={() => openDialog("add-funds")}>
            <Plus /> Add credits
          </Button>
          <Button variant="outline" size="sm" onClick={() => openDialog("auto-reload")}>
            <RefreshCw /> Auto reload
          </Button>
        </div>
      </KpiCard>

      <KpiCard
        label="Spend"
        aside={<Delta value={delta(spend, sum(previous, spendOf))} better="neither" />}
        value={formatUsd(spend)}
        caption={caption}
      >
        <div className="flex items-baseline justify-between text-[12.5px]">
          <span className="text-muted">{budget.label}</span>
          <span className="text-subtle tabular">
            <span className="text-fg">{formatUsd(budget.spent)}</span> / {formatUsd(budget.limit)}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className="h-full rounded-full bg-iris-400 transition-[width] duration-700"
            style={{ width: `${Math.min(100, (budget.spent / budget.limit) * 100)}%` }}
          />
        </div>
      </KpiCard>

      <KpiCard
        label="Requests"
        aside={<Delta value={delta(requests, sum(previous, requestsOf))} />}
        value={requests.toLocaleString("en-US")}
        caption={caption}
      >
        <dl className="grid grid-cols-2 gap-3 text-[12.5px]">
          <div>
            <dt className="text-muted">Avg / day</dt>
            <dd className="mt-0.5 text-[15px] font-medium text-fg tabular">
              {Math.round(requests / Math.max(1, days.length)).toLocaleString("en-US")}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Peak{peak && requestsOf(peak) > 0 ? ` · ${peak.label}` : ""}</dt>
            <dd className="mt-0.5 text-[15px] font-medium text-fg tabular">{(peak ? requestsOf(peak) : 0).toLocaleString("en-US")}</dd>
          </div>
        </dl>
      </KpiCard>

      <KpiCard
        label="Success rate"
        aside={<Delta value={delta(success, 1 - errorRate(previous))} />}
        value={sampleMode ? `${(success * 100).toFixed(2)}%` : "—"}
        caption={
          <>
            P50 latency <span className="font-medium text-fg tabular">{sampleMode ? `${(p50(days) / 1000).toFixed(2)}s` : "—"}</span>
            <Delta value={delta(p50(days), p50(previous))} better="lower" className="ml-1.5 inline-flex" />
          </>
        }
      >
        <div key={replayKey} className="flex h-11 items-end gap-[3px]">
          {errorRates.map((rate, i) => (
            <span
              key={i}
              title={sampleMode ? `${((1 - rate) * 100).toFixed(2)}% success` : undefined}
              className={cn(
                "flex-1 origin-bottom rounded-[2px]",
                !sampleMode ? "h-[2px] bg-white/25" : cn("h-7 animate-rise", rate > 0.012 ? "bg-warn" : "bg-ok"),
              )}
              style={sampleMode ? { animationDelay: `${(i / errorRates.length) * 450}ms` } : undefined}
            />
          ))}
        </div>
      </KpiCard>
    </div>
  );
}
