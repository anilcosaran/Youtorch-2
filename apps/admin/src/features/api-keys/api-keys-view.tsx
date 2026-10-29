"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { KEY_ENVS, KEY_STATUSES, listApiKeys } from "@modelvend/admin-api/api-keys";
import { DataTable, rowsOf } from "@/components/data/data-table";
import { ClearFilters, FilterBar, FilterSelect, SearchInput } from "@/components/data/filters";
import { ListPanel } from "@/components/data/list-panel";
import { PagerBar } from "@/components/data/pager";
import { EmptyState } from "@/components/data/states";
import { PageFill, PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { KEY_ENV_LABELS, KEY_STATUS_LABELS } from "@/lib/labels";
import { keys } from "@/lib/query-keys";
import { usePermissions } from "@/lib/session";
import { pick, usePager, useUrlState } from "@/lib/use-url-state";
import { KeyActionDialogs, KeyActionsMenu, useKeyActions } from "./key-actions";
import { keyColumns } from "./key-columns";

export function ApiKeysView() {
  const can = usePermissions();
  const { get, set } = useUrlState();
  const pager = usePager();
  const query = get("query");
  const env = pick(get("env"), KEY_ENVS);
  const status = pick(get("status"), KEY_STATUSES);
  // Customer pages link here for one workspace's keys.
  const customerId = get("customerId");
  const filters = { query, env, status, customerId, cursor: pager.cursor };

  const list = useQuery({
    queryKey: keys.apiKeyList(filters),
    queryFn: () => listApiKeys(filters),
    placeholderData: keepPreviousData,
  });
  const actions = useKeyActions();
  const filtered = Boolean(query || env || status || customerId);
  // The chip names the customer once a key of theirs is on screen.
  const customerName = customerId
    ? list.data?.items.find((row) => row.customer.id === customerId)?.customer.name
    : undefined;

  const columns = keyColumns({
    withCustomer: !customerId,
    actions: can.revokeKeys ? (row) => <KeyActionsMenu row={row} onStart={actions.start} /> : undefined,
  });

  return (
    <>
      <PageHeader title="API keys" description="Keys customers call the API with, newest first" />
      <PageFill>
        <FilterBar>
          <SearchInput
            label="Search keys"
            placeholder="Name, prefix, key ID or customer"
            value={query}
            onChange={(value) => set({ query: value })}
          />
          <FilterSelect
            label="Env"
            value={env}
            onChange={(value) => set({ env: value })}
            options={KEY_ENVS.map((e) => ({ value: e, label: KEY_ENV_LABELS[e] }))}
          />
          <FilterSelect
            label="Status"
            value={status}
            onChange={(value) => set({ status: value })}
            options={KEY_STATUSES.map((s) => ({ value: s, label: KEY_STATUS_LABELS[s] }))}
          />
          {customerId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => set({ customerId: null })}
              title="Show every customer's keys"
            >
              Customer{" "}
              {customerName ? (
                <span className="max-w-40 truncate">{customerName}</span>
              ) : (
                <span className="max-w-32 truncate font-mono text-xs">{customerId}</span>
              )}{" "}
              <X />
            </Button>
          )}
          <ClearFilters
            active={filtered}
            onClear={() => set({ query: null, env: null, status: null, customerId: null })}
          />
        </FilterBar>
        <ListPanel>
          <DataTable
            label="API keys"
            columns={columns}
            rows={rowsOf(list)}
            rowKey={(row) => row.id}
            error={list.error}
            onRetry={() => void list.refetch()}
            retrying={list.isFetching}
            empty={
              <EmptyState
                title={filtered ? "No keys match these filters" : "No API keys yet"}
                description={
                  filtered
                    ? "Try a broader search or clear the filters."
                    : "Keys appear here once customers create them in their console."
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
      <KeyActionDialogs action={actions.action} open={actions.open} setOpen={actions.setOpen} />
    </>
  );
}
