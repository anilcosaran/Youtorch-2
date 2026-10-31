"use client";

import type { Customer } from "@modelvend/admin-api/customers";
import { BarList } from "@/components/charts/bar-list";
import { ChartCard, ChartEmpty } from "@/components/charts/chart-card";
import { TimeSeriesChart } from "@/components/charts/time-series";
import { AccessLink } from "@/components/shared/access-link";
import { modelHref } from "@/lib/catalog";
import { day, dayLong, usd, usdAxis } from "@/lib/format";
import { UNIT_LABELS } from "@/lib/labels";

/** Matches the two stacked charts, so the card keeps its height when empty. */
const EMPTY_HEIGHT = 252;

/** Tasks and spend per day on one timeline, each chart with its own scale. */
export function UsageCard({ usage }: { usage: Customer["usage"] }) {
  const days = usage.length;
  const idle = usage.every((d) => d.tasks === 0 && d.spendMicros === 0);
  return (
    <ChartCard
      title="Usage"
      description={`Tasks and spend per day, last ${days} days`}
      info="Two charts on one timeline, each with its own scale, because tasks and dollars differ by orders of magnitude."
      accent="var(--series-1)"
    >
      {idle ? (
        <ChartEmpty height={EMPTY_HEIGHT} message={`No tasks in the last ${days} days`} />
      ) : (
        <div className="flex flex-col gap-3">
          <TimeSeriesChart
            data={usage}
            x="day"
            series={[
              { key: "tasks", label: "Tasks", color: "var(--series-1)" },
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
            series={[{ key: "spendMicros", label: "Spend", color: "var(--series-3)" }]}
            variant="area"
            legend="totals"
            height={100}
            tickFormat={day}
            labelFormat={dayLong}
            valueFormat={usd}
            axisFormat={usdAxis}
          />
        </div>
      )}
    </ChartCard>
  );
}

/** The models the workspace calls most, with what it spent on each. */
export function TopModelsCard({ models }: { models: Customer["topModels"] }) {
  const ranked = [...models].sort((a, b) => b.tasks - a.tasks);
  return (
    <ChartCard
      title="Top models"
      description="Tasks per model, with what was spent on it"
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
            value: m.tasks,
            detail: usd(m.spendMicros),
          }))}
        />
      )}
    </ChartCard>
  );
}
