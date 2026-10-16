"use client";

import { useQuery } from "@tanstack/react-query";
import { BarList } from "@/components/charts/bar-list";
import { ChartCard, ChartEmpty, ChartSkeleton } from "@/components/charts/chart-card";
import { TimeSeriesChart } from "@/components/charts/time-series";
import { ErrorState } from "@/components/data/states";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { AccessLink } from "@/components/shared/access-link";
import { RangeSwitch, useRange } from "@/components/shared/range-switch";
import { StatTile } from "@/components/shared/stat-tile";
import type { Range } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { modelHref } from "@/lib/api/models";
import { getOverview, type Overview } from "@/lib/api/overview";
import { compact, day, dayLong, percent, usdCompact } from "@/lib/format";
import { ProviderHealthTable } from "./provider-health";

const RANGE_TEXT: Record<Range, string> = {
  "7d": "last 7 days",
  "30d": "last 30 days",
  "90d": "last 90 days",
};

/** Error rates above this need someone to look. */
const ERROR_ALERT = 0.03;

const hintLink = "outline-none hover:text-foreground hover:underline focus-visible:text-foreground";

/**
 * Nine headline numbers in three rows of three: traffic, money, and the
 * state of the catalog and its providers.
 */
function Tiles({ data, range }: { data: Overview | undefined; range: Range }) {
  const t = data?.totals;
  const rangeText = RANGE_TEXT[range];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <StatTile
        label="Requests"
        value={t && compact(t.requests24h)}
        hint={
          <AccessLink permission="requests.view" href="/requests" className={hintLink}>
            Last 24 hours
          </AccessLink>
        }
        info="Calls to the public API in the last 24 hours, whatever their outcome."
      />
      <StatTile
        label="Error rate"
        value={t && (t.errorRate24h === null ? "—" : percent(t.errorRate24h))}
        tone={(t?.errorRate24h ?? 0) > ERROR_ALERT ? "attention" : undefined}
        hint={
          <AccessLink permission="requests.view" href="/requests?status=failed" className={hintLink}>
            Failed, last 24 hours
          </AccessLink>
        }
        info="Share of the last 24 hours' requests that failed after every attempt. Requests a fallback rescued count as succeeded."
      />
      <StatTile
        label="Active customers"
        value={t && compact(t.activeCustomers7d)}
        hint={
          <AccessLink permission="customers.view" href="/customers" className={hintLink}>
            Made a request, 7 days
          </AccessLink>
        }
        info="Customers with at least one request in the last 7 days."
      />
      <StatTile
        label="Revenue"
        value={t && usdCompact(t.revenue)}
        hint={`What customers paid, ${rangeText}`}
      />
      <StatTile
        label="Upstream cost"
        value={t && usdCompact(t.cost)}
        hint={`What providers charged, ${rangeText}`}
      />
      <StatTile
        label="Gross margin"
        value={t && (t.margin === null ? "—" : percent(t.margin))}
        tone={(t?.margin ?? 0) < 0 ? "attention" : undefined}
        hint={t ? `${usdCompact(t.revenue - t.cost)} kept, ${rangeText}` : rangeText}
        info="Revenue minus upstream cost, as a share of revenue."
      />
      <StatTile
        label="Live models"
        value={t && compact(t.liveModels)}
        hint={
          t && t.pausedModels === 0 ? (
            "None paused"
          ) : (
            <AccessLink permission="catalog.view" href="/models?state=paused" className={hintLink}>
              {t ? `${compact(t.pausedModels)} paused` : "Paused models"}
            </AccessLink>
          )
        }
        info="Models taking requests. Paused models refuse new ones with 503 model_paused."
      />
      <StatTile
        label="Providers degraded"
        value={t && compact(t.providersDegraded)}
        tone={t && t.providersDegraded > 0 ? "attention" : undefined}
        hint={
          <AccessLink permission="providers.view" href="/providers" className={hintLink}>
            {t && t.providersDegraded === 0 ? "All operational" : "Open providers"}
          </AccessLink>
        }
        info="Active providers whose health is degraded or in an outage. Their routes fall through to the next one."
      />
      <StatTile
        label="Deprecated versions"
        value={t && compact(t.deprecatedVersions)}
        hint="Sunsetting soon"
        info="Versions that still answer, with Deprecation and Sunset headers, until their sunset date."
        className="col-span-2 sm:col-span-1"
      />
    </div>
  );
}

/** Top models by requests, each linked to its page, with what it earned. */
function TopModels({ models }: { models: Overview["topModels"] }) {
  return (
    <BarList
      color="var(--series-2)"
      items={[...models]
        .sort((a, b) => b.requests - a.requests)
        .map((model) => ({
          key: model.modelId,
          label: (
            <>
              <AccessLink
                permission="catalog.view"
                href={modelHref(model.modelId)}
                title={model.modelId}
                className="truncate outline-none hover:underline focus-visible:underline"
                plainClassName="truncate"
              >
                {model.name}
              </AccessLink>
              <span className="hidden truncate font-mono text-xs text-muted-foreground sm:inline">
                {model.modelId}
              </span>
            </>
          ),
          value: model.requests,
          detail: usdCompact(model.revenue),
        }))}
    />
  );
}

const CHART_HEIGHT = 220;

export function OverviewView() {
  const [range, setRange] = useRange();
  const overview = useQuery({
    queryKey: keys.overview(range),
    queryFn: () => getOverview(range),
    placeholderData: (previous) => previous,
  });
  // The previous range stays up while the next loads, but not when that load fails.
  const data = overview.error && overview.isPlaceholderData ? undefined : overview.data;
  const rangeText = RANGE_TEXT[range];

  const chart = (render: (data: Overview) => React.ReactNode, height = CHART_HEIGHT) =>
    data ? render(data) : <ChartSkeleton height={height} />;

  return (
    <>
      <PageHeader title="Overview" description="How the API is used, what it earns and how providers hold up">
        <RangeSwitch value={range} onChange={setRange} />
      </PageHeader>
      <PageBody className="flex flex-col gap-4">
        {overview.error && !data ? (
          <ErrorState
            error={overview.error}
            onRetry={() => void overview.refetch()}
            retrying={overview.isFetching}
            className="rounded-lg border bg-card"
          />
        ) : (
          <>
            <Tiles data={data} range={range} />
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <ChartCard
                title="Requests"
                description={`Succeeded and failed per day, ${rangeText}`}
                info="A request fails when every attempt failed. Requests a fallback rescued count as succeeded."
                accent="var(--series-1)"
              >
                {chart((d) =>
                  d.series.every((row) => row.requests === 0) ? (
                    <ChartEmpty height={CHART_HEIGHT} message="No requests in this range" />
                  ) : (
                    <TimeSeriesChart
                      data={d.series.map((row) => ({
                        day: row.day,
                        succeeded: Math.max(0, row.requests - row.failed),
                        failed: row.failed,
                      }))}
                      x="day"
                      series={[
                        { key: "succeeded", label: "Succeeded", color: "var(--series-1)" },
                        { key: "failed", label: "Failed", color: "var(--status-critical)" },
                      ]}
                      variant="bar"
                      stacked
                      legend="totals"
                      tickFormat={day}
                      labelFormat={dayLong}
                    />
                  ),
                )}
              </ChartCard>

              <ChartCard
                title="Revenue and upstream cost"
                description={`What customers paid and what providers charged per day, ${rangeText}`}
                info="Revenue is what customers were billed for successful requests. Upstream cost is what providers charged us for them."
                accent="var(--series-3)"
              >
                {chart((d) => (
                  <TimeSeriesChart
                    data={d.series}
                    x="day"
                    series={[
                      { key: "revenue", label: "Revenue", color: "var(--series-3)" },
                      { key: "cost", label: "Upstream cost", color: "var(--series-2)" },
                    ]}
                    legend="totals"
                    valueFormat={usdCompact}
                    tickFormat={day}
                    labelFormat={dayLong}
                  />
                ))}
              </ChartCard>

              <ChartCard
                title="Gross margin"
                description={
                  data && data.totals.margin !== null
                    ? `Revenue minus upstream cost per day · ${percent(data.totals.margin)} over the ${rangeText}`
                    : `Revenue minus upstream cost per day, ${rangeText}`
                }
                info="What we kept each day after paying providers. A day below zero cost more upstream than customers paid."
                accent="var(--series-6)"
              >
                {chart((d) => (
                  <TimeSeriesChart
                    data={d.series.map((row) => ({ day: row.day, margin: row.revenue - row.cost }))}
                    x="day"
                    series={[{ key: "margin", label: "Gross margin", color: "var(--series-6)" }]}
                    variant="bar"
                    legend="totals"
                    valueFormat={usdCompact}
                    tickFormat={day}
                    labelFormat={dayLong}
                  />
                ))}
              </ChartCard>

              <ChartCard
                title="Signups"
                description={`New customers per day, ${rangeText}`}
                accent="var(--series-7)"
              >
                {chart((d) =>
                  d.series.every((row) => row.signups === 0) ? (
                    <ChartEmpty height={CHART_HEIGHT} message="No signups in this range" />
                  ) : (
                    <TimeSeriesChart
                      data={d.series}
                      x="day"
                      series={[{ key: "signups", label: "Signups", color: "var(--series-7)" }]}
                      variant="bar"
                      legend="totals"
                      tickFormat={day}
                      labelFormat={dayLong}
                    />
                  ),
                )}
              </ChartCard>

              <ChartCard
                title="Top models"
                description={`Most requested, with what each earned, ${rangeText}`}
                accent="var(--series-2)"
              >
                {chart((d) =>
                  d.topModels.length === 0 ? (
                    <ChartEmpty height={CHART_HEIGHT} message="No requests in this range" />
                  ) : (
                    <TopModels models={d.topModels} />
                  ),
                )}
              </ChartCard>

              <ChartCard
                title="Provider health"
                description="Success rate, median latency and traffic, last 24 hours"
                info="Degraded providers still take attempts; their failures fall back to the next route."
                accent="var(--status-warning)"
                action={
                  <AccessLink
                    permission="providers.view"
                    href="/providers"
                    className="text-xs text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:text-foreground"
                  >
                    Open providers
                  </AccessLink>
                }
              >
                {chart((d) =>
                  d.providers.length === 0 ? (
                    <ChartEmpty height={CHART_HEIGHT} message="No providers set up yet" />
                  ) : (
                    <ProviderHealthTable providers={d.providers} />
                  ),
                )}
              </ChartCard>
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}
