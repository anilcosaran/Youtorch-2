import { DataTable, type Column } from "@/components/data/data-table";
import { EmptyState } from "@/components/data/states";
import { DateTime } from "@/components/shared/time";
import type { LedgerEntry } from "@/lib/api/customers";
import { integer, usd } from "@/lib/format";
import { LEDGER_KIND_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

/** Credit in reads green with a plus; credit out keeps the ink with a minus. */
function Amount({ value }: { value: number }) {
  const credit = value > 0;
  return (
    <span className={cn("whitespace-nowrap tabular", credit ? "font-medium text-status-good" : "text-foreground")}>
      {credit ? "+" : value < 0 ? "−" : ""}
      {usd(Math.abs(value))}
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
  { id: "amount", header: "Amount", align: "right", cell: (row) => <Amount value={row.amount} /> },
];

/** Every change to the balance, newest first: top-ups, grants, refunds and usage summed per day. */
export function LedgerCard({ ledger }: { ledger: LedgerEntry[] }) {
  return (
    <section className="flex flex-col overflow-hidden rounded-lg border bg-card">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">Ledger · {integer(ledger.length)}</h2>
        <span className="text-xs text-muted-foreground">Every change to the balance; usage is summed per day</span>
      </header>
      <DataTable
        label="Ledger"
        columns={COLUMNS}
        rows={ledger}
        rowKey={(row) => row.id}
        className="max-h-[480px]"
        empty={
          <EmptyState
            title="No ledger entries yet"
            description="Top-ups, grants, refunds and daily usage appear here."
          />
        }
      />
    </section>
  );
}
