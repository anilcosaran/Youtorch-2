"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { DataTable } from "@/components/data/data-table";
import { EmptyState } from "@/components/data/states";
import { KeyActionDialogs, KeyActionsMenu, useKeyActions } from "@/features/api-keys/key-actions";
import { keyColumns } from "@/features/api-keys/key-columns";
import { listApiKeys } from "@/lib/api/api-keys";
import { keys } from "@/lib/api/keys";
import { integer } from "@/lib/format";
import { usePermissions } from "@/lib/session";

/** The workspace's API keys, with the same actions as the API keys page. Hidden without access to keys. */
export function CustomerKeys({ customerId }: { customerId: string }) {
  const can = usePermissions();
  const filters = { customerId };
  const list = useQuery({
    queryKey: keys.apiKeyList(filters),
    queryFn: () => listApiKeys(filters),
    enabled: can.viewKeys,
  });
  const actions = useKeyActions();
  if (!can.viewKeys) return null;

  const rows = list.data?.items;
  const active = rows?.filter((row) => row.status === "active").length;
  const href = `/api-keys?customerId=${encodeURIComponent(customerId)}`;
  const columns = keyColumns({
    withCustomer: false,
    compact: true,
    actions: can.revokeKeys ? (row) => <KeyActionsMenu row={row} onStart={actions.start} /> : undefined,
  });

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">API keys{rows ? ` · ${integer(rows.length)}` : ""}</h2>
        {active !== undefined && rows && active < rows.length && (
          <span className="text-xs text-muted-foreground">{integer(active)} active</span>
        )}
        <Link
          href={href}
          className="ml-auto text-xs text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:underline"
        >
          Open in API keys
        </Link>
      </header>
      <DataTable
        label="API keys of this customer"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        error={list.error}
        onRetry={() => void list.refetch()}
        retrying={list.isFetching}
        skeletonRows={3}
        className="max-h-[400px]"
        empty={
          <EmptyState
            title="No API keys"
            description="They haven't created a key yet. Keys are made in the customer console."
          />
        }
      />
      {list.data?.nextCursor && (
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">
          Showing the first {integer(list.data.items.length)}.{" "}
          <Link href={href} className="text-foreground hover:underline">
            See every key
          </Link>
        </p>
      )}
      <KeyActionDialogs action={actions.action} open={actions.open} setOpen={actions.setOpen} />
    </section>
  );
}
