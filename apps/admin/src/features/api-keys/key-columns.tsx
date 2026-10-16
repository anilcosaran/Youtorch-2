"use client";

import type { Column } from "@/components/data/data-table";
import { AccessLink } from "@/components/shared/access-link";
import { CopyButton } from "@/components/shared/copy-field";
import { Pill, type Tone } from "@/components/shared/pill";
import { KeyStatusPill } from "@/components/shared/status";
import { DateTime, RelativeTime } from "@/components/shared/time";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ApiKeyRow, KeyEnv } from "@/lib/api/api-keys";
import { dateTime, integer, plural, usd } from "@/lib/format";
import { KEY_ENV_LABELS } from "@/lib/labels";

const ENV_TONES: Record<KeyEnv, Tone> = { live: "info", test: "neutral" };

export function EnvPill({ env }: { env: KeyEnv }) {
  return <Pill tone={ENV_TONES[env]}>{KEY_ENV_LABELS[env]}</Pill>;
}

/** The key's name and the prefix a customer can quote from a ticket. */
function KeyName({ row }: { row: ApiKeyRow }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate font-medium">{row.name}</span>
      <span className="flex min-w-0 items-center gap-0.5">
        <span className="truncate font-mono text-xs text-muted-foreground">{row.prefix}</span>
        <CopyButton value={row.prefix} label="Key prefix" className="size-5" />
      </span>
    </span>
  );
}

/** Active or revoked; a revoked key tells when and why on hover. */
function KeyStatusCell({ row }: { row: ApiKeyRow }) {
  if (row.status !== "revoked") return <KeyStatusPill status={row.status} />;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="inline-flex cursor-help rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <KeyStatusPill status={row.status} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-72 flex-col items-start gap-0.5">
        <span className="font-medium">{row.revokedAt ? `Revoked ${dateTime(row.revokedAt)}` : "Revoked"}</span>
        {row.revokedReason && <span className="opacity-80">{row.revokedReason}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

/** "All models", or how many models and apps the key is limited to, listed on hover. */
function Scopes({ scopes }: { scopes: string[] }) {
  if (scopes.length === 0) return <span className="text-muted-foreground">All models</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="cursor-help whitespace-nowrap underline decoration-muted-foreground/40 decoration-dotted underline-offset-4 outline-none focus-visible:text-foreground"
        >
          {plural(scopes.length, "scope")}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-80 flex-col items-start gap-0.5">
        <span className="opacity-80">May call only</span>
        <ul className="grid gap-0.5 font-mono">
          {scopes.map((scope) => (
            <li key={scope} className="break-all">
              {scope}
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

/** Columns that stay at full strength on a revoked row. */
const UNDIMMED = new Set(["status", "actions"]);

/**
 * Columns of a key list. The full list shows whose key it is and what it may
 * call; a customer's own page leaves those out. Revoked keys are dimmed.
 */
export function keyColumns({
  withCustomer = true,
  compact = false,
  actions,
}: {
  withCustomer?: boolean;
  compact?: boolean;
  /** Row actions; the column is left out without them. */
  actions?: (row: ApiKeyRow) => React.ReactNode;
}): Column<ApiKeyRow>[] {
  const columns: Column<ApiKeyRow>[] = [
    { id: "key", header: "Key", className: "min-w-48 max-w-72", cell: (row) => <KeyName row={row} /> },
  ];
  if (withCustomer) {
    columns.push({
      id: "customer",
      header: "Customer",
      className: "min-w-44 max-w-64",
      cell: (row) => (
        <span className="flex min-w-0 flex-col">
          <AccessLink
            permission="customers.view"
            href={`/customers/${row.customer.id}`}
            className="truncate outline-none hover:underline focus-visible:underline"
            plainClassName="truncate"
          >
            {row.customer.name}
          </AccessLink>
          <span className="truncate text-xs text-muted-foreground">{row.customer.workspace}</span>
        </span>
      ),
    });
  }
  columns.push(
    { id: "env", header: "Env", cell: (row) => <EnvPill env={row.env} /> },
    { id: "status", header: "Status", cell: (row) => <KeyStatusCell row={row} /> },
  );
  if (!compact) columns.push({ id: "scopes", header: "Scopes", cell: (row) => <Scopes scopes={row.scopes} /> });
  columns.push(
    {
      id: "limit",
      header: "Spend limit",
      align: "right",
      cell: (row) =>
        row.spendLimit === null ? (
          <span className="text-muted-foreground">None</span>
        ) : (
          <span className="tabular">{usd(row.spendLimit)}</span>
        ),
    },
    {
      id: "spend",
      header: "Spend 30d",
      align: "right",
      cell: (row) => <span className="tabular">{usd(row.spend30d)}</span>,
    },
    {
      id: "requests",
      header: "Requests 30d",
      align: "right",
      cell: (row) => <span className="tabular">{integer(row.requests30d)}</span>,
    },
    { id: "used", header: "Last used", cell: (row) => <RelativeTime value={row.lastUsedAt} /> },
  );
  if (!compact) {
    columns.push({ id: "created", header: "Created", cell: (row) => <DateTime value={row.createdAt} time={false} /> });
  }
  if (actions) {
    columns.push({
      id: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      className: "w-12",
      cell: actions,
    });
  }
  return columns.map((column) =>
    UNDIMMED.has(column.id)
      ? column
      : {
          ...column,
          cell: (row) =>
            row.status === "revoked" ? <div className="opacity-55">{column.cell(row)}</div> : column.cell(row),
        },
  );
}
