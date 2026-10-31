"use client";

import { useQuery } from "@tanstack/react-query";
import { LockKeyhole } from "lucide-react";
import type { Range } from "@modelvend/admin-api/client";
import { getOverview, type Overview, type OverviewModel, type OverviewTotals } from "@modelvend/admin-api/overview";
import { BarList } from "@/components/charts/bar-list";
import { ChartCard, ChartEmpty, ChartSkeleton } from "@/components/charts/chart-card";
import { TimeSeriesChart, type SeriesSpec } from "@/components/charts/time-series";
import { EmptyState, ErrorState } from "@/components/data/states";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { AccessLink } from "@/components/shared/access-link";
import { RangeSwitch, useRange } from "@/components/shared/range-switch";
import { StatTile } from "@/components/shared/stat-tile";
import { Skeleton } from "@/components/ui/skeleton";
import { modelHref } from "@/lib/catalog";
import { compact, day, dayLong, percent, usdAxis, usdCompact } from "@/lib/format";
import { keys } from "@/lib/query-keys";
import { useSession } from "@/lib/session";
import { ProviderHealthTable } from "./provider-health";
import { anySection, overviewSections, type OverviewSections } from "./sections";

const RANGE_TEXT: Record<Range, string> = {
  "7d": "last 7 days",
  "30d": "last 30 days",
  "90d": "last 90 days",
};

/** Error rates above this need someone to look. */
const ERROR_ALERT = 0.03;

const hintLink = "outline-none hover:text-foreground hover:underline focus-visible:text-foreground";

/**
 * Up to nine headline numbers: traffic, money, and the state of the catalog
 * and its providers. Each shows only to operators who may see the same data
 * on its own screen; the server leaves the others out.
 */
function Tiles({ totals: t, show, range }: { totals: OverviewTotals | undefined; show: OverviewSections; range: Range }) {
  const rangeText = RANGE_TEXT[range];
  const tiles: React.ReactElement[] = [];
  if (show.traffic) {
    tiles.push(
      <StatTile
        key="tasks"
        label="Tasks"
        value={t?.tasks24h !== undefined ? compact(t.tasks24h) : undefined}
        hint={
          <AccessLink permission="tasks.view" href="/tasks" className={hintLink}>
            Last 24 hours
          </AccessLink>
        }
        info="Model calls and app runs in the last 24 hours, whatever their outcome."
      />,
      <StatTile
        key="error-rate"
        label="Error rate"
        value={t?.errorRate24h === undefined ? undefined : t.errorRate24h === null ? "—" : percent(t.errorRate24h)}
        tone={(t?.errorRate24h ?? 0) > ERROR_ALERT ? "attention" : undefined}
        hint={
          <AccessLink permission="tasks.view" href="/tasks?status=failed" className={hintLink}>
            Failed, last 24 hours
          </AccessLink>
        }
        info="Share of the last 24 hours' tasks that failed after every attempt. Tasks a fallback rescued count as succeeded."
      />,
    );
  }
  if (show.customers) {
    tiles.push(
      <StatTile
        key="customers"
        label="Active customers"
        value={t?.activeCustomers7d !== undefined ? compact(t.activeCustomers7d) : undefined}
        hint={
          <AccessLink permission="customers.view" href="/customers" className={hintLink}>
            Ran a task, 7 days
          </AccessLink>
        }
        info="Customers with at least one task in the last 7 days."
      />,
    );
  }
  if (show.revenue) {
    tiles.push(
      <StatTile
        key="revenue"
        label="Revenue"
        value={t?.revenueMicros !== undefined ? usdCompact(t.revenueMicros) : undefined}
        hint={`Purchased-credit usage minus refunds, ${rangeText}`}
        info="What purchased credits paid for, less refunds. Gift credits and internal workspaces don't count."
      />,
    );
  }
  if (show.cost) {
    tiles.push(
      <StatTile
        key="cost"
        label="Upstream cost"
        value={t?.costMicros !== undefined ? usdCompact(t.costMicros) : undefined}
        hint={`What providers charged, ${rangeText}`}
      />,
    );
  }
  if (show.margin) {
    tiles.push(
      <StatTile
        key="margin"
        label="Gross margin"
        value={t?.margin === undefined ? undefined : t.margin === null ? "—" : percent(t.margin)}
        tone={(t?.margin ?? 0) < 0 ? "attention" : undefined}
        hint={t?.revenueMicros !== undefined && t.costMicros !== undefined ? `${usdCompact(t.revenueMicros - t.costMicros)} kept, ${rangeText}` : rangeText}
        info="Revenue minus upstream cost, as a share of revenue."
      />,
    );
  }
  if (show.catalog) {
    tiles.push(
      <StatTile
        key="live-models"
        label="Live models"
        value={t?.liveModels !== undefined ? compact(t.liveModels) : undefined}
        hint={
          t?.pausedModels === 0 ? (
            "None paused"
          ) : (
            <AccessLink permission="catalog.view" href="/models?state=paused" className={hintLink}>
              {t?.pausedModels !== undefined ? `${compact(t.pausedModels)} paused` : "Paused models"}
            </AccessLink>
          )
        }
        info="Models taking tasks. Paused models refuse new ones with 503 model_paused."
      />,
    );
  }
  if (show.providers) {
    tiles.push(
      <StatTile
        key="providers"
        label="Providers degraded"
        value={t?.providersDegraded !== undefined ? compact(t.providersDegraded) : undefined}
        tone={(t?.providersDegraded ?? 0) > 0 ? "attention" : undefined}
        hint={
          <AccessLink permission="providers.view" href="/providers" className={hintLink}>
            {t?.providersDegraded === 0 ? "All operational" : "Open providers"}
          </AccessLink>
        }
        info="Active providers whose health is degraded or in an outage. Their routes fall through to the next one."
      />,
    );
  }
  if (show.catalog) {
    tiles.push(
      <StatTile
        key="deprecated"
        label="Deprecated versions"
        value={t?.deprecatedVersions !== undefined ? compact(t.deprecatedVersions) : undefined}
        hint="Still answering"
        info="Versions that still answer, with Deprecation and Sunset headers, until someone retires them. The sunset date allows that."
      />,
    );
  }
  if (tiles.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {tiles.map((tile, index) =>
        // On two columns, an odd last tile spans the row.
        index === tiles.length - 1 && tiles.length % 2 === 1 ? (
          <div key={tile.key} className="col-span-2 grid sm:col-span-1">
            {tile}
          </div>
        ) : (
          tile
        ),
      )}
    </div>
  );
}

/** Top models by tasks, each linked to its page, with what it earned. */
function TopModels({ models }: { models: OverviewModel[] }) {
  return (
    <BarList
      color="var(--series-2)"
      items={[...models]
        .sort((a, b) => b.tasks - a.tasks)
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
          value: model.tasks,
          detail: usdCompact(model.revenueMicros),
        }))}
    />
  );
}

const CHART_HEIGHT = 220;

/** Shown while it isn't yet known which parts the operator gets. */
function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-lg" />
    </div>
  );
}

export function OverviewView() {
  const [range, setRange] = useRange();
  const { operator, can } = useSession();
  const overview = useQuery({
    queryKey: keys.overview(range),
    queryFn: () => getOverview(range),
    placeholderData: (previous) => previous,
  });
  // The previous range stays up while the next loads, but not when that load fails.
  const data = overview.error && overview.isPlaceholderData ? undefined : overview.data;
  const rangeText = RANGE_TEXT[range];
  const show = overviewSections(data, operator ? can : null);

  const chart = (render: (data: Overview) => React.ReactNode, height = CHART_HEIGHT) =>
    data ? render(data) : <ChartSkeleton height={height} />;

  const moneyTitle = show?.revenue && show.cost ? "Revenue and upstream cost" : show?.revenue ? "Revenue" : "Upstream cost";
  const moneySeries: SeriesSpec<"revenue" | "cost">[] = [];
  if (show?.revenue) moneySeries.push({ key: "revenue", label: "Revenue", color: "var(--series-3)" });
  if (show?.cost) moneySeries.push({ key: "cost", label: "Upstream cost", color: "var(--series-2)" });

  let body: React.ReactNode;
  if (overview.error && !data) {
    body = (
      <ErrorState
        error={overview.error}
        onRetry={() => void overview.refetch()}
        retrying={overview.isFetching}
        className="rounded-lg border bg-card"
      />
    );
  } else if (!show) {
    body = <OverviewSkeleton />;
  } else if (!anySection(show)) {
    body = (
      <EmptyState
        icon={LockKeyhole}
        title="Nothing here for your access"
        description="The overview shows figures from the screens your account can open. Ask an admin for access if you need more."
        className="rounded-lg border bg-card"
      />
    );
  } else {
    body = (
      <>
        <Tiles totals={data?.totals} show={show} range={range} />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {show.traffic && (
            <ChartCard
              title="Tasks"
              description={`Succeeded and failed per day, ${rangeText}`}
              info="A task fails when every attempt failed. Tasks a fallback rescued count as succeeded."
              accent="var(--series-1)"
            >
              {chart((d) =>
                d.series.every((row) => !row.tasks) ? (
                  <ChartEmpty height={CHART_HEIGHT} message="No tasks in this range" />
                ) : (
                  <TimeSeriesChart
                    data={d.series.map((row) => ({
                      day: row.day,
                      succeeded: Math.max(0, (row.tasks ?? 0) - (row.failed ?? 0)),
                      failed: row.failed ?? 0,
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
          )}

          {(show.revenue || show.cost) && (
            <ChartCard
              title={moneyTitle}
              description={
                show.revenue && show.cost
                  ? `Purchased-credit usage minus refunds, and what providers charged, per day, ${rangeText}`
                  : show.revenue
                    ? `Purchased-credit usage minus refunds per day, ${rangeText}`
                    : `What providers charged per day, ${rangeText}`
              }
              info="Revenue is what purchased credits paid for, less refunds; gift credits and internal workspaces don't count. Upstream cost is what providers charged us."
              accent={show.revenue ? "var(--series-3)" : "var(--series-2)"}
            >
              {chart((d) => (
                <TimeSeriesChart
                  data={d.series.map((row) => ({ day: row.day, revenue: row.revenueMicros ?? 0, cost: row.costMicros ?? 0 }))}
                  x="day"
                  series={moneySeries}
                  legend="totals"
                  valueFormat={usdCompact}
                  axisFormat={usdAxis}
                  tickFormat={day}
                  labelFormat={dayLong}
                />
              ))}
            </ChartCard>
          )}

          {show.margin && (
            <ChartCard
              title="Gross margin"
              description={
                data?.totals.margin !== undefined && data.totals.margin !== null
                  ? `Revenue minus upstream cost per day · ${percent(data.totals.margin)} over the ${rangeText}`
                  : `Revenue minus upstream cost per day, ${rangeText}`
              }
              info="What we kept each day after paying providers. A day below zero cost more upstream than customers paid."
              accent="var(--series-6)"
            >
              {chart((d) => (
                <TimeSeriesChart
                  data={d.series.map((row) => ({ day: row.day, margin: (row.revenueMicros ?? 0) - (row.costMicros ?? 0) }))}
                  x="day"
                  series={[{ key: "margin", label: "Gross margin", color: "var(--series-6)" }]}
                  variant="bar"
                  legend="totals"
                  valueFormat={usdCompact}
                  axisFormat={usdAxis}
                  tickFormat={day}
                  labelFormat={dayLong}
                />
              ))}
            </ChartCard>
          )}

          {show.customers && (
            <ChartCard title="Signups" description={`New customers per day, ${rangeText}`} accent="var(--series-7)">
              {chart((d) =>
                d.series.every((row) => !row.signups) ? (
                  <ChartEmpty height={CHART_HEIGHT} message="No signups in this range" />
                ) : (
                  <TimeSeriesChart
                    data={d.series.map((row) => ({ day: row.day, signups: row.signups ?? 0 }))}
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
          )}

          {show.catalog && (
            <ChartCard
              title="Top models"
              description={`Most used, with what each earned, ${rangeText}`}
              accent="var(--series-2)"
            >
              {chart((d) =>
                !d.topModels || d.topModels.length === 0 ? (
                  <ChartEmpty height={CHART_HEIGHT} message="No tasks in this range" />
                ) : (
                  <TopModels models={d.topModels} />
                ),
              )}
            </ChartCard>
          )}

          {show.providers && (
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
                !d.providers || d.providers.length === 0 ? (
                  <ChartEmpty height={CHART_HEIGHT} message="No providers set up yet" />
                ) : (
                  <ProviderHealthTable providers={d.providers} />
                ),
              )}
            </ChartCard>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Overview" description="How the API is used, what it earns and how providers hold up">
        <RangeSwitch value={range} onChange={setRange} />
      </PageHeader>
      <PageBody className="flex flex-col gap-4">{body}</PageBody>
    </>
  );
}
