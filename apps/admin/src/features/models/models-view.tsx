"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Star } from "lucide-react";
import { DataTable, rowsOf, type Column } from "@/components/data/data-table";
import { ClearFilters, FilterBar, FilterSelect, SearchInput } from "@/components/data/filters";
import { ListPanel } from "@/components/data/list-panel";
import { PagerBar } from "@/components/data/pager";
import { EmptyState } from "@/components/data/states";
import { PageFill, PageHeader } from "@/components/layout/page-header";
import { ModelStatePill, VisibilityPill } from "@/components/shared/status";
import { RelativeTime } from "@/components/shared/time";
import { Button } from "@/components/ui/button";
import { keys } from "@/lib/api/keys";
import { listModels, MODALITIES, MODEL_STATES, modelHref, VISIBILITIES, type ModelSummary } from "@/lib/api/models";
import { listProviders } from "@/lib/api/providers";
import { integer, percent, unitPrice, usdCompact } from "@/lib/format";
import { MODALITY_LABELS, MODEL_STATE_LABELS, UNIT_SHORT, VISIBILITY_LABELS } from "@/lib/labels";
import { usePermissions } from "@/lib/session";
import { pick, usePager, useUrlState } from "@/lib/use-url-state";
import { cn } from "@/lib/utils";
import { NewModelDialog } from "./new-model-dialog";

/** Error rates above this read as a problem. */
const ERROR_ALERT = 0.05;

function Versions({ counts }: { counts: ModelSummary["versions"] }) {
  const extra = [
    counts.draft > 0 && `${counts.draft} draft`,
    counts.deprecated > 0 && `${counts.deprecated} deprecated`,
  ].filter(Boolean);
  return (
    <span className="flex flex-col items-end leading-tight">
      <span className="tabular">{integer(counts.total)}</span>
      {extra.length > 0 && <span className="text-xs whitespace-nowrap text-muted-foreground">{extra.join(" · ")}</span>}
    </span>
  );
}

const COLUMNS: Column<ModelSummary>[] = [
  {
    id: "model",
    header: "Model",
    className: "min-w-64",
    cell: (row) => (
      <span className="block min-w-0">
        <span className="flex items-center gap-1.5">
          <Link
            href={modelHref(row.id)}
            onClick={(e) => e.stopPropagation()}
            className="truncate font-medium outline-none hover:underline focus-visible:underline"
          >
            {row.name}
          </Link>
          {row.featured && <Star className="size-3.5 shrink-0 fill-current text-status-warning" aria-label="Featured" />}
        </span>
        <span className="block truncate font-mono text-xs text-muted-foreground">{row.id}</span>
      </span>
    ),
  },
  { id: "modality", header: "Modality", cell: (row) => MODALITY_LABELS[row.modality] },
  {
    id: "status",
    header: "Status",
    cell: (row) => (
      <span className="flex flex-wrap items-center gap-1.5">
        <ModelStatePill state={row.state} />
        {row.visibility !== "public" && <VisibilityPill visibility={row.visibility} />}
      </span>
    ),
  },
  {
    id: "default",
    header: "Default",
    cell: (row) =>
      row.defaultVersion ? (
        <span className="font-mono text-xs whitespace-nowrap">{row.defaultVersion}</span>
      ) : (
        <span className="text-muted-foreground">Not live</span>
      ),
  },
  { id: "versions", header: "Versions", align: "right", cell: (row) => <Versions counts={row.versions} /> },
  {
    id: "providers",
    header: "Providers",
    className: "max-w-48",
    cell: (row) =>
      row.providers.length === 0 ? (
        <span className="font-medium text-status-critical">No active route</span>
      ) : (
        <span className="block truncate text-muted-foreground" title={row.providers.join(", ")}>
          {row.providers.join(", ")}
        </span>
      ),
  },
  {
    id: "price",
    header: "Price",
    align: "right",
    cell: (row) =>
      row.price ? (
        <span className="whitespace-nowrap tabular">
          {unitPrice(row.price.price)}
          <span className="text-muted-foreground">{UNIT_SHORT[row.price.unit]}</span>
        </span>
      ) : (
        "—"
      ),
  },
  { id: "requests", header: "Requests 24h", align: "right", cell: (row) => <span className="tabular">{integer(row.requests24h)}</span> },
  {
    id: "errors",
    header: "Errors",
    align: "right",
    cell: (row) =>
      row.errorRate24h === null ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <span className={cn("tabular", row.errorRate24h > ERROR_ALERT && "font-medium text-status-critical")}>
          {percent(row.errorRate24h)}
        </span>
      ),
  },
  { id: "revenue", header: "Revenue 30d", align: "right", cell: (row) => <span className="tabular">{usdCompact(row.revenue30d)}</span> },
  { id: "updated", header: "Updated", cell: (row) => <RelativeTime value={row.updatedAt} /> },
];

export function ModelsView() {
  const router = useRouter();
  const can = usePermissions();
  const { get, set } = useUrlState();
  const pager = usePager();
  const [creating, setCreating] = useState(false);
  const query = get("query");
  const modality = pick(get("modality"), MODALITIES);
  const state = pick(get("state"), MODEL_STATES);
  const visibility = pick(get("visibility"), VISIBILITIES);
  const provider = get("provider");
  const filters = { query, modality, state, visibility, provider, cursor: pager.cursor };

  const list = useQuery({
    queryKey: keys.modelList(filters),
    queryFn: () => listModels(filters),
    placeholderData: keepPreviousData,
  });
  const providers = useQuery({ queryKey: keys.providers, queryFn: listProviders, enabled: can.viewProviders });
  const filtered = Boolean(query || modality || state || visibility || provider);

  return (
    <>
      <PageHeader title="Models" description="Every model callers can address, its versions and where it runs">
        {can.editCatalog && (
          <Button onClick={() => setCreating(true)}>
            <Plus /> New model
          </Button>
        )}
      </PageHeader>
      <PageFill>
        <FilterBar>
          <SearchInput
            label="Search models"
            placeholder="Name, ID or task"
            value={query}
            onChange={(value) => set({ query: value })}
          />
          <FilterSelect
            label="Modality"
            value={modality}
            onChange={(value) => set({ modality: value })}
            options={MODALITIES.map((m) => ({ value: m, label: MODALITY_LABELS[m] }))}
          />
          <FilterSelect
            label="Status"
            value={state}
            onChange={(value) => set({ state: value })}
            options={MODEL_STATES.map((s) => ({ value: s, label: MODEL_STATE_LABELS[s] }))}
          />
          <FilterSelect
            label="Visibility"
            value={visibility}
            onChange={(value) => set({ visibility: value })}
            options={VISIBILITIES.map((v) => ({ value: v, label: VISIBILITY_LABELS[v] }))}
          />
          {providers.data && (
            <FilterSelect
              label="Provider"
              value={provider}
              onChange={(value) => set({ provider: value })}
              options={providers.data.map((p) => ({ value: p.id, label: p.name }))}
            />
          )}
          <ClearFilters
            active={filtered}
            onClear={() => set({ query: null, modality: null, state: null, visibility: null, provider: null })}
          />
        </FilterBar>
        <ListPanel>
          <DataTable
            label="Models"
            columns={COLUMNS}
            rows={rowsOf(list)}
            rowKey={(row) => row.id}
            onRowClick={(row) => router.push(modelHref(row.id))}
            error={list.error}
            onRetry={() => void list.refetch()}
            retrying={list.isFetching}
            empty={
              <EmptyState
                title={filtered ? "No models match these filters" : "No models yet"}
                description={
                  filtered ? "Try a broader search or clear the filters." : "Add a model, then a version with a route to make it callable."
                }
              />
            }
          />
          <PagerBar
            pager={pager}
            nextCursor={list.isPlaceholderData ? undefined : list.data?.nextCursor}
            shown={rowsOf(list)?.length}
            fetching={list.isFetching}
          />
        </ListPanel>
      </PageFill>
      <NewModelDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
