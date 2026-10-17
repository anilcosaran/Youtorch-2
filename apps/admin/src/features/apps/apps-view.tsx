"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { APP_CATEGORIES, APP_STATUSES, listApps, type AppSummary } from "@modelvend/admin-api/apps";
import { DataTable, type Column } from "@/components/data/data-table";
import { ClearFilters, FilterBar, FilterSelect, SearchInput } from "@/components/data/filters";
import { ListPanel } from "@/components/data/list-panel";
import { EmptyState } from "@/components/data/states";
import { PageFill, PageHeader } from "@/components/layout/page-header";
import { AppStatusPill } from "@/components/shared/status";
import { RelativeTime } from "@/components/shared/time";
import { Button } from "@/components/ui/button";
import { integer, unitPrice, usdCompact } from "@/lib/format";
import { APP_CATEGORY_LABELS, APP_STATUS_LABELS } from "@/lib/labels";
import { keys } from "@/lib/query-keys";
import { matchesQuery } from "@/lib/search";
import { usePermissions } from "@/lib/session";
import { pick, useUrlState } from "@/lib/use-url-state";
import { NewAppDialog } from "./new-app-dialog";

const COLUMNS: Column<AppSummary>[] = [
  {
    id: "app",
    header: "App",
    className: "min-w-64",
    cell: (row) => (
      <span className="block min-w-0">
        <Link
          href={`/apps/${row.slug}`}
          onClick={(e) => e.stopPropagation()}
          className="block truncate font-medium outline-none hover:underline focus-visible:underline"
        >
          {row.name}
        </Link>
        <span className="block truncate text-xs text-muted-foreground">{row.tagline}</span>
      </span>
    ),
  },
  { id: "category", header: "Category", cell: (row) => APP_CATEGORY_LABELS[row.category] },
  { id: "status", header: "Status", cell: (row) => <AppStatusPill status={row.status} /> },
  {
    id: "release",
    header: "Release",
    cell: (row) => (
      <span className="flex flex-col leading-tight">
        <span className="tabular">{row.liveRelease === null ? <span className="text-muted-foreground">Not deployed</span> : `#${row.liveRelease} live`}</span>
        {row.draftRelease !== null && <span className="text-xs text-muted-foreground">#{row.draftRelease} in draft</span>}
      </span>
    ),
  },
  {
    id: "models",
    header: "Models",
    className: "max-w-56",
    cell: (row) =>
      row.models.length === 0 ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <span className="block truncate font-mono text-xs text-muted-foreground" title={row.models.join(", ")}>
          {row.models.join(", ")}
        </span>
      ),
  },
  { id: "price", header: "Price / run", align: "right", cell: (row) => <span className="tabular">{unitPrice(row.price)}</span> },
  { id: "runs", header: "Runs 24h", align: "right", cell: (row) => <span className="tabular">{integer(row.runs24h)}</span> },
  { id: "revenue", header: "Revenue 30d", align: "right", cell: (row) => <span className="tabular">{usdCompact(row.revenue30d)}</span> },
  { id: "updated", header: "Updated", cell: (row) => <RelativeTime value={row.updatedAt} /> },
];

/** Every app: curated workflows that run pinned model versions behind one price. */
export function AppsView() {
  const router = useRouter();
  const can = usePermissions();
  const { get, set } = useUrlState();
  const [creating, setCreating] = useState(false);
  const query = get("query") ?? "";
  const status = pick(get("status"), APP_STATUSES);
  const category = pick(get("category"), APP_CATEGORIES);
  const apps = useQuery({ queryKey: keys.appList, queryFn: listApps });
  const rows = apps.data?.filter(
    (app) =>
      matchesQuery(query, app.name, app.slug, app.tagline, ...app.models) &&
      (!status || app.status === status) &&
      (!category || app.category === category),
  );
  const filtered = Boolean(query || status || category);

  return (
    <>
      <PageHeader title="Apps" description="Workflows built on catalog models, deployed as numbered releases">
        {can.editCatalog && (
          <Button onClick={() => setCreating(true)}>
            <Plus /> New app
          </Button>
        )}
      </PageHeader>
      <PageFill>
        <FilterBar>
          <SearchInput
            label="Search apps"
            placeholder="Name, slug or model"
            value={query || undefined}
            onChange={(value) => set({ query: value })}
          />
          <FilterSelect
            label="Status"
            value={status}
            onChange={(value) => set({ status: value })}
            options={APP_STATUSES.map((s) => ({ value: s, label: APP_STATUS_LABELS[s] }))}
          />
          <FilterSelect
            label="Category"
            value={category}
            onChange={(value) => set({ category: value })}
            options={APP_CATEGORIES.map((c) => ({ value: c, label: APP_CATEGORY_LABELS[c] }))}
          />
          <ClearFilters active={filtered} onClear={() => set({ query: null, status: null, category: null })} />
        </FilterBar>
        <ListPanel>
          <DataTable
            label="Apps"
            columns={COLUMNS}
            rows={rows}
            rowKey={(row) => row.slug}
            onRowClick={(row) => router.push(`/apps/${row.slug}`)}
            error={apps.error}
            onRetry={() => void apps.refetch()}
            retrying={apps.isFetching}
            empty={
              <EmptyState
                title={filtered ? "No apps match these filters" : "No apps yet"}
                description={filtered ? "Try a broader search or clear the filters." : "Create an app, add steps to its first release and deploy it."}
              />
            }
          />
          {rows && rows.length > 0 && (
            <div className="flex h-11 shrink-0 items-center border-t px-3 text-xs text-muted-foreground">
              {integer(rows.length)} {rows.length === 1 ? "app" : "apps"}
            </div>
          )}
        </ListPanel>
      </PageFill>
      <NewAppDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
