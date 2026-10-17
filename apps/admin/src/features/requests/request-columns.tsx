"use client";

import type { Column } from "@/components/data/data-table";
import { AccessLink } from "@/components/shared/access-link";
import { PanelRowLink } from "@/components/shared/panel-link";
import { RequestStatusPill } from "@/components/shared/status";
import { RelativeTime } from "@/components/shared/time";
import { modelHref } from "@/lib/api/models";
import type { RequestRow } from "@/lib/api/requests";
import { milliseconds, plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import { inFlight, marginOf, money, unitsText } from "./request-format";

const stop = (event: React.MouseEvent) => event.stopPropagation();

const none = <span className="text-muted-foreground">—</span>;

/**
 * `google/veo-3.1@v2` with the slug standing out, linked to the model at
 * that version. Clicks stay off the row it sits in.
 */
export function ModelRef({ model, version, className }: { model: string; version: string; className?: string }) {
  const slash = model.lastIndexOf("/");
  const publisher = model.slice(0, slash + 1);
  const slug = model.slice(slash + 1);
  const text = (
    <>
      <span className="text-muted-foreground">{publisher}</span>
      <span className="font-medium group-hover/model:underline group-focus-visible/model:underline">{slug}</span>
      <span className="text-muted-foreground">@{version}</span>
    </>
  );
  return (
    <AccessLink
      permission="catalog.view"
      href={modelHref(model, version)}
      onClick={stop}
      title={`${model}@${version}`}
      className={cn("group/model block truncate outline-none", className)}
      plainClassName={cn("block truncate", className)}
    >
      {text}
    </AccessLink>
  );
}

/** Money that isn't final while the request is in flight. */
function Amount({ row, value, signed = false }: { row: RequestRow; value: number; signed?: boolean }) {
  if (inFlight(row.status)) return none;
  return (
    <span className={cn("whitespace-nowrap tabular", signed && value < 0 && "font-medium text-status-critical")}>
      {money(value)}
    </span>
  );
}

/** Columns of the request log; `providerName` turns a provider ID into its name. */
export function requestColumns(providerName: (id: string) => string): Column<RequestRow>[] {
  return [
    {
      id: "request",
      header: "Request",
      cell: (row) => (
        <span className="flex min-w-0 flex-col leading-tight">
          <PanelRowLink
            to={{ kind: "request", id: row.id }}
            className="truncate font-mono text-xs outline-none hover:underline focus-visible:underline"
          >
            {row.id}
          </PanelRowLink>
          {row.app && <span className="mt-0.5 truncate text-xs text-muted-foreground">app: {row.app}</span>}
        </span>
      ),
    },
    {
      id: "model",
      header: "Model",
      className: "max-w-64",
      cell: (row) => <ModelRef model={row.model} version={row.version} />,
    },
    {
      id: "customer",
      header: "Customer",
      className: "max-w-52",
      cell: (row) => (
        <span className="flex min-w-0 flex-col leading-tight">
          <AccessLink
            permission="customers.view"
            href={`/customers/${row.customer.id}`}
            onClick={stop}
            className="truncate outline-none hover:underline focus-visible:underline"
            plainClassName="truncate"
          >
            {row.customer.name}
          </AccessLink>
          <span className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{row.keyPrefix}</span>
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => (
        <span className="flex flex-col items-start gap-0.5">
          <RequestStatusPill status={row.status} />
          {row.errorCode && (
            <span className="max-w-40 truncate font-mono text-[11px] text-status-critical" title={row.errorCode}>
              {row.errorCode}
            </span>
          )}
        </span>
      ),
    },
    {
      id: "provider",
      header: "Provider",
      cell: (row) => (
        <span className="flex flex-col leading-tight whitespace-nowrap">
          {row.provider ? providerName(row.provider) : none}
          {row.attempts > 1 && (
            <span className="mt-0.5 text-xs text-muted-foreground">{plural(row.attempts, "attempt")}</span>
          )}
        </span>
      ),
    },
    {
      id: "latency",
      header: "Latency",
      align: "right",
      cell: (row) =>
        row.latencyMs === null ? none : <span className="whitespace-nowrap tabular">{milliseconds(row.latencyMs)}</span>,
    },
    {
      id: "units",
      header: "Units",
      align: "right",
      cell: (row) =>
        row.units === 0 && inFlight(row.status) ? (
          none
        ) : (
          <span className="whitespace-nowrap tabular">{unitsText(row.units, row.unit)}</span>
        ),
    },
    { id: "price", header: "Price", align: "right", cell: (row) => <Amount row={row} value={row.price} /> },
    {
      id: "margin",
      header: "Margin",
      align: "right",
      cell: (row) => <Amount row={row} value={marginOf(row)} signed />,
    },
    { id: "created", header: "Created", cell: (row) => <RelativeTime value={row.createdAt} /> },
  ];
}
