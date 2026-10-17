"use client";

import { BarList } from "@/components/charts/bar-list";
import { ChartCard, ChartEmpty } from "@/components/charts/chart-card";
import { TimeSeriesChart } from "@/components/charts/time-series";
import { AccessLink } from "@/components/shared/access-link";
import type { Customer } from "@/lib/api/customers";
import { modelHref } from "@/lib/api/models";
import { day, dayLong, usd } from "@/lib/format";
import { UNIT_LABELS } from "@/lib/labels";

/** Matches the two stacked charts, so the card keeps its height when empty. */
const EMPTY_HEIGHT = 252;

/** Requests and spend per day on one timeline, each chart with its own scale. */
export function UsageCard({ usage }: { usage: Customer["usage"] }) {
  const days = usage.length;
  const idle = usage.every((d) => d.requests === 0 && d.spend === 0);
  return (
    <ChartCard
      title="Usage"
      description={`Requests and spend per day, last ${days} days`}
      info="Two charts on one timeline, each with its own scale, because requests and dollars differ by orders of magnitude."
      accent="var(--series-1)"
    >
      {idle ? (
        <ChartEmpty height={EMPTY_HEIGHT} message={`No requests in the last ${days} days`} />
      ) : (
        <div className="flex flex-col gap-3">
          <TimeSeriesChart
            data={usage}
            x="day"
            series={[
              { key: "requests", label: "Requests", color: "var(--series-1)" },
              { key: "errors", label: "Failed", color: "var(--status-critical)" },
            ]}
            legend="totals"
            height={100}
            tickFormat={day}
            labelFormat={dayLong}
          />
          <TimeSeriesChart
            data={usage}
            x="day"
            series={[{ key: "spend", label: "Spend", color: "var(--series-3)" }]}
            variant="area"
            legend="totals"
            height={100}
            tickFormat={day}
            labelFormat={dayLong}
            valueFormat={usd}
          />
        </div>
      )}
    </ChartCard>
  );
}

/** The models the workspace calls most, with what it spent on each. */
export function TopModelsCard({ models }: { models: Customer["topModels"] }) {
  const ranked = [...models].sort((a, b) => b.requests - a.requests);
  return (
    <ChartCard
      title="Top models"
      description="Requests per model, with what was spent on it"
      accent="var(--series-2)"
    >
      {ranked.length === 0 ? (
        <ChartEmpty height={EMPTY_HEIGHT} message="No models called yet" />
      ) : (
        <BarList
          color="var(--series-2)"
          items={ranked.map((m) => ({
            key: m.modelId,
            label: (
              <span className="min-w-0 truncate" title={`${m.modelId}, billed per ${UNIT_LABELS[m.unit]}`}>
                <AccessLink
                  permission="catalog.view"
                  href={modelHref(m.modelId)}
                  className="outline-none hover:underline focus-visible:underline"
                >
                  {m.modelId}
                </AccessLink>
              </span>
            ),
            value: m.requests,
            detail: usd(m.spend),
          }))}
        />
      )}
    </ChartCard>
  );
}
