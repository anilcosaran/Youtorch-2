"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CUSTOMER_STATUSES, listCustomers, type CustomerRow } from "@modelvend/admin-api/customers";
import { DataTable, rowsOf, type Column } from "@/components/data/data-table";
import { ClearFilters, FilterBar, FilterSelect, SearchInput } from "@/components/data/filters";
import { ListPanel } from "@/components/data/list-panel";
import { PagerBar } from "@/components/data/pager";
import { EmptyState } from "@/components/data/states";
import { PageFill, PageHeader } from "@/components/layout/page-header";
import { Monogram } from "@/components/shared/monogram";
import { CustomerStatusPill } from "@/components/shared/status";
import { DateTime, RelativeTime } from "@/components/shared/time";
import { integer, usd } from "@/lib/format";
import { CUSTOMER_STATUS_LABELS } from "@/lib/labels";
import { keys } from "@/lib/query-keys";
import { pick, usePager, useUrlState } from "@/lib/use-url-state";
import { cn } from "@/lib/utils";
import { Balance } from "./balance";

const COLUMNS: Column<CustomerRow>[] = [
  {
    id: "customer",
    header: "Customer",
    className: "min-w-60",
    cell: (row) => (
      <span className="flex min-w-0 items-center gap-2.5">
        <Monogram name={row.name} />
        <span className="min-w-0">
          <Link
            href={`/customers/${row.id}`}
            onClick={(e) => e.stopPropagation()}
            className="block truncate font-medium outline-none hover:underline focus-visible:underline"
          >
            {row.name}
          </Link>
          <span className="block truncate text-xs text-muted-foreground" title={row.owner.name}>
            {row.owner.email}
          </span>
        </span>
      </span>
    ),
  },
  { id: "status", header: "Status", cell: (row) => <CustomerStatusPill status={row.status} /> },
  {
    id: "balance",
    header: "Balance",
    align: "right",
    cell: (row) => (
      <span className="flex flex-col items-end leading-tight">
        <Balance value={row.balanceMicros} />
        {row.heldMicros > 0 && <span className="text-xs whitespace-nowrap text-muted-foreground">{usd(row.heldMicros)} held</span>}
      </span>
    ),
  },
  {
    id: "spend",
    header: "Spend 30d",
    align: "right",
    cell: (row) => <span className="tabular">{usd(row.spend30dMicros)}</span>,
  },
  {
    id: "tasks",
    header: "Tasks 30d",
    align: "right",
    cell: (row) => <span className="tabular">{integer(row.tasks30d)}</span>,
  },
  { id: "members", header: "Members", align: "right", cell: (row) => <span className="tabular">{integer(row.members)}</span> },
  {
    id: "keys",
    header: "Keys",
    align: "right",
    cell: (row) => (
      <span className={cn("tabular", row.keys === 0 && "text-muted-foreground")}>{integer(row.keys)}</span>
    ),
  },
  { id: "active", header: "Last active", cell: (row) => <RelativeTime value={row.lastActiveAt} /> },
  { id: "joined", header: "Joined", cell: (row) => <DateTime value={row.createdAt} time={false} /> },
];

export function CustomersView() {
  const router = useRouter();
  const { get, set } = useUrlState();
  const pager = usePager();
  const query = get("query");
  const status = pick(get("status"), CUSTOMER_STATUSES);
  const filters = { query, status, cursor: pager.cursor };

  const list = useQuery({
    queryKey: keys.customerList(filters),
    queryFn: () => listCustomers(filters),
    placeholderData: keepPreviousData,
  });
  const filtered = Boolean(query || status);

  return (
    <>
      <PageHeader title="Customers" description="Workspaces that call the API, their credit and their usage" />
      <PageFill>
        <FilterBar>
          <SearchInput
            label="Search customers"
            placeholder="Workspace name or a member's email"
            value={query}
            onChange={(value) => set({ query: value })}
          />
          <FilterSelect
            label="Status"
            value={status}
            onChange={(value) => set({ status: value })}
            options={CUSTOMER_STATUSES.map((s) => ({ value: s, label: CUSTOMER_STATUS_LABELS[s] }))}
          />
          <ClearFilters active={filtered} onClear={() => set({ query: null, status: null })} />
        </FilterBar>
        <ListPanel>
          <DataTable
            label="Customers"
            columns={COLUMNS}
            rows={rowsOf(list)}
            rowKey={(row) => row.id}
            onRowClick={(row) => router.push(`/customers/${row.id}`)}
            error={list.error}
            onRetry={() => void list.refetch()}
            retrying={list.isFetching}
            empty={
              <EmptyState
                title={filtered ? "No customers match these filters" : "No customers yet"}
                description={
                  filtered
                    ? "Try a broader search or clear the filters."
                    : "Workspaces appear here once someone signs up for an API key."
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
    </>
  );
}
