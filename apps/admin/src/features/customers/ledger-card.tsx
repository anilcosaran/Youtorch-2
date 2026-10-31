"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { listLedger, type LedgerEntry } from "@modelvend/admin-api/customers";
import { DataTable, type Column } from "@/components/data/data-table";
import { EmptyState } from "@/components/data/states";
import { DateTime } from "@/components/shared/time";
import { Button } from "@/components/ui/button";
import { integer, usdPrecise } from "@/lib/format";
import { LEDGER_KIND_LABELS } from "@/lib/labels";
import { keys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

/** How many entries each "Load more" brings. */
const PAGE_SIZE = 50;

/** Credit in reads green with a plus; credit out keeps the ink with a minus. */
function Amount({ value }: { value: number }) {
  const credit = value > 0;
  return (
    <span className={cn("whitespace-nowrap tabular", credit ? "font-medium text-status-good" : "text-foreground")}>
      {credit ? "+" : value < 0 ? "−" : ""}
      {usdPrecise(Math.abs(value))}
    </span>
  );
}

const COLUMNS: Column<LedgerEntry>[] = [
  { id: "at", header: "When", cell: (row) => <DateTime value={row.at} /> },
  {
    id: "kind",
    header: "Kind",
    cell: (row) => (
      <span className="inline-flex h-5 items-center rounded bg-muted px-1.5 text-xs whitespace-nowrap">
        {LEDGER_KIND_LABELS[row.kind]}
      </span>
    ),
  },
  {
    id: "note",
    header: "Note",
    className: "max-w-96",
    cell: (row) =>
      row.note ? (
        <span className="block truncate" title={row.note}>
          {row.note}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    id: "operator",
    header: "Operator",
    cell: (row) => row.operator ?? <span className="text-muted-foreground">—</span>,
  },
  { id: "amount", header: "Amount", align: "right", cell: (row) => <Amount value={row.amountMicros} /> },
];

/**
 * Every change to the balance, newest first: top-ups, grants, refunds, expiries, fees and usage summed per day. Its
 * query sits under the customers area, so anything that changes a customer loads it again.
 */
export function LedgerCard({ customerId }: { customerId: string }) {
  const ledger = useInfiniteQuery({
    queryKey: keys.ledger(customerId),
    queryFn: ({ pageParam }) => listLedger(customerId, { limit: PAGE_SIZE, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = ledger.data?.pages.flatMap((page) => page.items);
  return (
    <section className="flex flex-col overflow-hidden rounded-lg border bg-card">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">
          Ledger
          {rows && ` · ${integer(rows.length)}${ledger.hasNextPage ? "+" : ""}`}
        </h2>
        <span className="text-xs text-muted-foreground">Every change to the balance; usage is summed per day</span>
      </header>
      <DataTable
        label="Ledger"
        columns={COLUMNS}
        rows={rows}
        rowKey={(row) => row.id}
        error={ledger.error}
        onRetry={() => void ledger.refetch()}
        retrying={ledger.isFetching}
        skeletonRows={3}
        className="max-h-[480px]"
        empty={
          <EmptyState
            title="No ledger entries yet"
            description="Top-ups, grants, refunds and daily usage appear here."
          />
        }
      />
      {ledger.hasNextPage && (
        <div className="flex justify-center border-t px-4 py-2">
          <Button variant="outline" size="xs" disabled={ledger.isFetchingNextPage} onClick={() => void ledger.fetchNextPage()}>
            {ledger.isFetchingNextPage && <LoaderCircle className="animate-spin" />}
            Load more
          </Button>
        </div>
      )}
    </section>
  );
}
