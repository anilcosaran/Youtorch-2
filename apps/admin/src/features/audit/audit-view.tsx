"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { X } from "lucide-react";
import { AUDIT_ACTIONS, listAudit, type AuditEntry } from "@modelvend/admin-api/audit";
import { listOperators } from "@modelvend/admin-api/operators";
import { DataTable, rowsOf, type Column } from "@/components/data/data-table";
import { ClearFilters, FilterBar, FilterSelect } from "@/components/data/filters";
import { ListPanel } from "@/components/data/list-panel";
import { PagerBar } from "@/components/data/pager";
import { EmptyState } from "@/components/data/states";
import { PageFill, PageHeader } from "@/components/layout/page-header";
import { JsonView } from "@/components/shared/json-view";
import { PanelLink } from "@/components/shared/panel-link";
import { DateTime } from "@/components/shared/time";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { modelHref } from "@/lib/catalog";
import type { Permissions } from "@/lib/permissions";
import { keys } from "@/lib/query-keys";
import { usePermissions } from "@/lib/session";
import { pick, usePager, useUrlState } from "@/lib/use-url-state";

/**
 * Where a target lives in the console, when it has a page the operator may
 * open. Versions and routes are written as `publisher/slug@version`; tasks
 * open in the side panel.
 */
function targetHref(entry: AuditEntry, can: Permissions): string | null {
  const id = entry.targetId;
  if (!id) return null;
  switch (entry.targetType) {
    case "model":
      return can.viewCatalog ? modelHref(id) : null;
    case "version":
    case "route": {
      const [model, version] = id.split("@");
      return can.viewCatalog ? modelHref(model, version?.split("/")[0]) : null;
    }
    case "app":
      return can.viewCatalog ? `/apps/${id}` : null;
    case "provider":
      return can.viewProviders ? "/providers" : null;
    case "customer":
      return can.viewCustomers ? `/customers/${id}` : null;
    case "api_key":
      return can.viewKeys ? `/api-keys?query=${encodeURIComponent(id)}` : null;
    case "operator":
      return can.manageOperators ? "/operators" : null;
    default:
      return null;
  }
}

/** How a target filter reads in its chip. */
const TARGET_LABELS: Record<string, string> = {
  model: "Model",
  version: "Version",
  route: "Route",
  app: "App",
  provider: "Provider",
  customer: "Customer",
  api_key: "API key",
  task: "Task",
  settings: "Settings",
  operator: "Operator",
};

/** Who acted: an operator, the command line, or nobody signed in (a failed sign-in). */
function actorOf(entry: AuditEntry): string {
  if (entry.operator) return entry.operator.name;
  if (entry.detail.via === "cli") return "Command line";
  return entry.action.startsWith("auth.") ? "Not signed in" : "System";
}

/** Group prefixes ("version") match every action under them. */
const ACTION_OPTIONS = [...new Set(AUDIT_ACTIONS.map((a) => a.split(".")[0]))].flatMap((group) => [
  { value: group, label: `${group}.*` },
  ...AUDIT_ACTIONS.filter((a) => a.startsWith(`${group}.`)).map((a) => ({ value: a, label: a })),
]);
const ACTION_VALUES = ACTION_OPTIONS.map((option) => option.value);

const COLUMNS: Column<AuditEntry>[] = [
  { id: "at", header: "When", cell: (row) => <DateTime value={row.at} /> },
  {
    id: "operator",
    header: "Operator",
    cell: (row) =>
      row.operator ? row.operator.name : <span className="text-muted-foreground">{actorOf(row)}</span>,
  },
  {
    id: "action",
    header: "Action",
    cell: (row) => (
      <span className="inline-flex h-5 items-center rounded bg-muted px-1.5 font-mono text-xs">
        {row.action}
      </span>
    ),
  },
  {
    id: "target",
    header: "Target",
    className: "max-w-72",
    cell: (row) => (
      <span className="block truncate">
        <span className="text-muted-foreground">{row.targetType}</span>
        {row.targetId && <span className="ml-1.5 font-mono text-xs">{row.targetId}</span>}
      </span>
    ),
  },
  {
    id: "ip",
    header: "IP",
    cell: (row) => <span className="font-mono text-xs text-muted-foreground">{row.ip ?? "—"}</span>,
  },
];

function EntrySheet({ entry, onClose }: { entry: AuditEntry | null; onClose: () => void }) {
  const can = usePermissions();
  const href = entry ? targetHref(entry, can) : null;
  return (
    <Sheet open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        {entry && (
          <>
            <SheetHeader className="border-b">
              <SheetTitle className="pr-8 font-mono text-sm">{entry.action}</SheetTitle>
              <SheetDescription>
                {actorOf(entry)} · <DateTime value={entry.at} />
              </SheetDescription>
            </SheetHeader>
            <div className="scroll-thin flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Target</dt>
                  <dd>{entry.targetType}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">IP address</dt>
                  <dd className="font-mono text-xs">{entry.ip ?? "—"}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-muted-foreground">Target ID</dt>
                  <dd className="font-mono text-xs break-all">
                    {entry.targetType === "task" && entry.targetId ? (
                      <PanelLink to={{ kind: "task", id: entry.targetId }} onOpen={onClose} className="hover:underline">
                        {entry.targetId}
                      </PanelLink>
                    ) : href ? (
                      <Link href={href} className="hover:underline">
                        {entry.targetId}
                      </Link>
                    ) : (
                      (entry.targetId ?? "—")
                    )}
                  </dd>
                </div>
              </dl>
              <div>
                <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">Detail</h3>
                <JsonView value={entry.detail} />
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function AuditView() {
  const can = usePermissions();
  const { get, set } = useUrlState();
  const pager = usePager();
  const operatorId = get("operatorId");
  const action = pick(get("action"), ACTION_VALUES);
  // Model and app pages link here for what changed on one target.
  const targetType = get("targetType");
  const targetId = targetType ? get("targetId") : undefined;
  // Customer pages link here for everything about one customer: the customer, its keys and refunds.
  const customerId = get("customerId");
  const filters = { operatorId, action, targetType: targetId ? targetType : undefined, targetId, customerId, cursor: pager.cursor };
  const filtered = Boolean(operatorId || action || targetId || customerId);
  const list = useQuery({
    queryKey: keys.auditList(filters),
    queryFn: () => listAudit(filters),
    placeholderData: keepPreviousData,
  });
  // Only admins may list operators; others pick from the operators on screen.
  const operators = useQuery({
    queryKey: keys.operators,
    queryFn: listOperators,
    enabled: can.manageOperators,
  });
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  const operatorOptions = new Map<string, string>();
  for (const operator of operators.data ?? []) operatorOptions.set(operator.id, operator.name);
  for (const entry of list.data?.items ?? []) {
    if (entry.operator) operatorOptions.set(entry.operator.id, entry.operator.name);
  }
  if (operatorId && !operatorOptions.has(operatorId)) operatorOptions.set(operatorId, operatorId);

  return (
    <>
      <PageHeader title="Audit log" description="Every change made in the console, newest first" />
      <PageFill>
        <FilterBar>
          <FilterSelect
            label="Operator"
            value={operatorId}
            onChange={(value) => set({ operatorId: value })}
            options={[...operatorOptions].map(([value, label]) => ({ value, label }))}
          />
          <FilterSelect
            label="Action"
            value={action}
            onChange={(value) => set({ action: value })}
            options={ACTION_OPTIONS}
          />
          {targetId && (
            <Button variant="outline" size="sm" onClick={() => set({ targetType: null, targetId: null })}>
              {TARGET_LABELS[targetType ?? ""] ?? targetType}{" "}
              <span className="max-w-32 truncate font-mono text-xs">{targetId}</span> <X />
            </Button>
          )}
          {customerId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => set({ customerId: null })}
              title="Changes to the customer, its API keys and refunds of its tasks"
            >
              Customer <span className="max-w-32 truncate font-mono text-xs">{customerId}</span> <X />
            </Button>
          )}
          <ClearFilters
            active={filtered}
            onClear={() => set({ operatorId: null, action: null, targetType: null, targetId: null, customerId: null })}
          />
        </FilterBar>
        <ListPanel>
          <DataTable
            label="Audit log"
            columns={COLUMNS}
            rows={rowsOf(list)}
            rowKey={(row) => row.id}
            onRowClick={setSelected}
            isActiveRow={(row) => row.id === selected?.id}
            error={list.error}
            onRetry={() => void list.refetch()}
            retrying={list.isFetching}
            empty={
              <EmptyState
                title={filtered ? "No entries match these filters" : "Nothing logged yet"}
                description="Sign-ins and every change appear here."
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
      <EntrySheet entry={selected} onClose={() => setSelected(null)} />
    </>
  );
}
