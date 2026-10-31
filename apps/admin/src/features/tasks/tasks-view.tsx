"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { listModels } from "@modelvend/admin-api/models";
import { listTasks, TASK_STATUSES, type TaskRow } from "@modelvend/admin-api/tasks";
import { DataTable, rowsOf } from "@/components/data/data-table";
import { ClearFilters, FilterBar, FilterSelect, SearchInput, type FilterOption } from "@/components/data/filters";
import { ListPanel } from "@/components/data/list-panel";
import { PagerBar } from "@/components/data/pager";
import { EmptyState } from "@/components/data/states";
import { PageFill, PageHeader } from "@/components/layout/page-header";
import { usePanelList, usePanelOpen, usePanels } from "@/components/layout/panel-context";
import { Button } from "@/components/ui/button";
import { TASK_STATUS_LABELS } from "@/lib/labels";
import { keys } from "@/lib/query-keys";
import { usePermissions } from "@/lib/session";
import { pick, usePager, useUrlState } from "@/lib/use-url-state";
import { taskColumns } from "./task-columns";
import { inFlight } from "./task-format";
import { useProviders } from "./use-providers";

/** How often the list refreshes while a task on it is queued or running. */
const LIVE_INTERVAL = 15_000;

/** Enough models for the filter; the catalog is far smaller than this. */
const MODEL_OPTIONS = 200;

const byLabel = (a: FilterOption<string>, b: FilterOption<string>) => a.label.localeCompare(b.label);

/**
 * Options for a filter: what the catalog lists, what is on screen, and the
 * current value even when neither has it, so the select never reads blank.
 */
function optionsOf(known: Map<string, string>, current: string | undefined): FilterOption<string>[] {
  const all = new Map(known);
  if (current && !all.has(current)) all.set(current, current);
  return [...all].map(([value, label]) => ({ value, label })).sort(byLabel);
}

/** Model IDs to filter by: the catalog when the operator may read it, plus the models on screen. */
function useModelOptions(rows: TaskRow[] | undefined, current: string | undefined) {
  const can = usePermissions();
  const models = useQuery({
    queryKey: keys.modelOptions,
    queryFn: () => listModels({ limit: MODEL_OPTIONS }),
    enabled: can.viewCatalog,
    staleTime: 5 * 60_000,
    meta: { silent: true },
  });
  const known = new Map<string, string>();
  for (const model of models.data?.items ?? []) known.set(model.id, model.id);
  for (const row of rows ?? []) if (row.model) known.set(row.model, row.model);
  return optionsOf(known, current);
}

/** A pulsing dot while the list follows tasks that are still running. */
function LiveMark() {
  return (
    <span
      className="flex items-center gap-1.5 text-xs text-muted-foreground"
      title="Refreshes every 15 seconds while a task on this page is queued or running"
    >
      <span className="size-1.5 animate-pulse rounded-full bg-status-good" aria-hidden />
      Updating live
    </span>
  );
}

export function TasksView() {
  const { get, set } = useUrlState();
  const pager = usePager();
  const panels = usePanels();
  const openId = usePanelOpen("task");
  const query = get("query");
  const status = pick(get("status"), TASK_STATUSES);
  const model = get("model");
  const provider = get("provider");
  // Customer pages link here for one customer's tasks.
  const customerId = get("customerId");

  const filters = { query, status, model, provider, customerId, cursor: pager.cursor };
  const list = useQuery({
    queryKey: keys.taskList(filters),
    queryFn: () => listTasks(filters),
    placeholderData: keepPreviousData,
    refetchInterval: (q) => (q.state.data?.items.some((row) => inFlight(row.status)) ? LIVE_INTERVAL : false),
  });
  const rows = rowsOf(list);
  usePanelList("task", rows?.map((row) => row.id) ?? []);

  const providers = useProviders();
  const providerOptions = new Map<string, string>();
  for (const p of providers.list ?? []) providerOptions.set(p.id, p.name);
  for (const row of rows ?? []) if (row.provider) providerOptions.set(row.provider, providers.nameOf(row.provider));
  const modelOptions = useModelOptions(rows, model);

  const live = Boolean(rows?.some((row) => inFlight(row.status)));
  const filtered = Boolean(query || status || model || provider || customerId);
  const customerName = list.data?.items.find((row) => row.customer.id === customerId)?.customer.name;

  return (
    <>
      <PageHeader title="Tasks" description="Every model call and app run, newest first">
        {live && <LiveMark />}
      </PageHeader>
      <PageFill>
        <FilterBar>
          <SearchInput
            label="Search tasks"
            placeholder="Task ID or model ID"
            value={query}
            onChange={(value) => set({ query: value })}
          />
          <FilterSelect
            label="Status"
            value={status}
            onChange={(value) => set({ status: value })}
            options={TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS_LABELS[s] }))}
          />
          <FilterSelect
            label="Model"
            value={model}
            onChange={(value) => set({ model: value })}
            options={modelOptions}
          />
          <FilterSelect
            label="Provider"
            value={provider}
            onChange={(value) => set({ provider: value })}
            options={optionsOf(providerOptions, provider)}
          />
          {customerId && (
            <Button
              variant="outline"
              size="sm"
              title="Show every customer's tasks"
              onClick={() => set({ customerId: null })}
            >
              {customerName ?? "One customer"} <X />
            </Button>
          )}
          <ClearFilters
            active={filtered}
            onClear={() => set({ query: null, status: null, model: null, provider: null, customerId: null })}
          />
        </FilterBar>
        <ListPanel>
          <DataTable
            label="Tasks"
            columns={taskColumns(providers.nameOf)}
            rows={rows}
            rowKey={(row) => row.id}
            onRowClick={(row) => void panels.open({ kind: "task", id: row.id })}
            isActiveRow={(row) => row.id === openId}
            error={list.error}
            onRetry={() => void list.refetch()}
            retrying={list.isFetching}
            empty={
              filtered ? (
                <EmptyState
                  title="No tasks match these filters"
                  description="Try a broader search or clear the filters."
                />
              ) : (
                <EmptyState
                  title="No tasks yet"
                  description="Model calls and app runs appear here as they arrive."
                />
              )
            }
          />
          <PagerBar
            pager={pager}
            nextCursor={list.isPlaceholderData ? undefined : list.data?.nextCursor}
            shown={rows?.length}
            fetching={list.isFetching}
          />
        </ListPanel>
      </PageFill>
    </>
  );
}
