"use client";

import { useState } from "react";
import { ArrowRight, ArrowUpRight, Braces, CircleDollarSign, Ellipsis, Plus, Route, Star } from "lucide-react";
import {
  promoteVersion,
  retireVersion,
  setDefaultVersion,
  VERSION_STATUSES,
  type Model,
  type ModelVersion,
} from "@modelvend/admin-api/models";
import { DataTable, type Column } from "@/components/data/data-table";
import { EmptyState } from "@/components/data/states";
import { useConfirm } from "@/components/shared/confirm";
import { InfoTip } from "@/components/shared/info-tip";
import { Pill } from "@/components/shared/pill";
import { VersionStatusPill } from "@/components/shared/status";
import { DateTime } from "@/components/shared/time";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { defaultTier } from "@/lib/catalog";
import { integer, unitPrice } from "@/lib/format";
import { UNIT_SHORT, VERSION_STATUS_DESCRIPTIONS, VERSION_STATUS_LABELS } from "@/lib/labels";
import { usePermissions } from "@/lib/session";
import { DeprecateDialog, NewVersionDialog } from "./version-dialogs";
import type { ModelTab } from "./model-detail";
import { useModelAction } from "./use-model-action";

/** Draft → Staging → Live → Deprecated → Retired, with what each step means. */
function Lifecycle() {
  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2 rounded-lg border bg-card px-4 py-3 text-xs" aria-label="Version lifecycle">
      {VERSION_STATUSES.map((status, i) => (
        <li key={status} className="flex items-center gap-1.5">
          {i > 0 && <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />}
          <VersionStatusPill status={status} />
          <InfoTip label={VERSION_STATUS_LABELS[status]}>{VERSION_STATUS_DESCRIPTIONS[status]}</InfoTip>
        </li>
      ))}
      <li className="w-full text-muted-foreground sm:ml-auto sm:w-auto">
        Schema and price are frozen once a version is live; change them in a new version.
      </li>
    </ol>
  );
}

function RowActions({
  model,
  version,
  onManage,
  onDeprecate,
}: {
  model: Model;
  version: ModelVersion;
  onManage: (versionId: string, tab: ModelTab) => void;
  onDeprecate: (version: ModelVersion) => void;
}) {
  const can = usePermissions();
  const confirm = useConfirm();
  const run = useModelAction();
  const isDefault = version.id === model.defaultVersion;
  const activeRoutes = version.routes.filter((r) => r.status === "active").length;

  const promote = async (to: "staging" | "live") => {
    if (to === "live") {
      const becomesDefault = model.defaultVersion === null;
      const ok = await confirm({
        title: `Put ${version.id} live?`,
        description: becomesDefault
          ? `Customers can call it right away, and it becomes the default because ${model.name} has none yet.`
          : `Customers can call it by pinning ${model.id}@${version.id}. Unpinned requests keep getting ${model.defaultVersion} until you make this the default.`,
        action: "Put live",
      });
      if (!ok) return;
    }
    await run(
      () => promoteVersion(model.id, version.id, to),
      to === "live" ? `${version.id} is live` : `${version.id} is on staging`,
      "Couldn't promote the version",
    );
  };

  const makeDefault = async () => {
    const ok = await confirm({
      title: `Make ${version.id} the default?`,
      description: `Unpinned requests to ${model.id} get ${version.id} from now on. Callers pinned to ${model.defaultVersion ?? "another version"} aren't affected.`,
      action: "Make default",
    });
    if (ok) await run(() => setDefaultVersion(model.id, version.id), `${version.id} is the default`, "Couldn't change the default");
  };

  const retire = async () => {
    const ok = await confirm({
      title: `Retire ${version.id}?`,
      description: version.replacement
        ? `Requests pinned to it go to ${version.replacement} from now on. This can't be undone.`
        : "Requests pinned to it fail with 410 Gone from now on. This can't be undone.",
      action: "Retire",
      destructive: true,
    });
    if (ok) await run(() => retireVersion(model.id, version.id), `${version.id} is retired`, "Couldn't retire the version");
  };

  const lifecycle: React.ReactNode[] = [];
  if (can.publishCatalog) {
    if (version.status === "draft") {
      lifecycle.push(
        <DropdownMenuItem key="staging" onSelect={() => void promote("staging")}>
          <ArrowUpRight /> Promote to staging
        </DropdownMenuItem>,
      );
    }
    if (version.status === "draft" || version.status === "staging") {
      lifecycle.push(
        <DropdownMenuItem key="live" onSelect={() => void promote("live")} disabled={activeRoutes === 0}>
          <ArrowUpRight /> {activeRoutes === 0 ? "Put live (needs an active route)" : "Put live"}
        </DropdownMenuItem>,
      );
    }
    if (version.status === "live" && !isDefault) {
      lifecycle.push(
        <DropdownMenuItem key="default" onSelect={() => void makeDefault()}>
          <Star /> Make default
        </DropdownMenuItem>,
        <DropdownMenuItem key="deprecate" onSelect={() => onDeprecate(version)}>
          Deprecate…
        </DropdownMenuItem>,
      );
    }
    if (version.status === "deprecated") {
      lifecycle.push(
        <DropdownMenuItem key="retire" variant="destructive" onSelect={() => void retire()}>
          Retire…
        </DropdownMenuItem>,
      );
    }
  }

  return (
    <span onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${version.id}`}>
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onSelect={() => onManage(version.id, "routing")}>
            <Route /> Routes
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onManage(version.id, "pricing")}>
            <CircleDollarSign /> Pricing
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onManage(version.id, "schema")}>
            <Braces /> Schema
          </DropdownMenuItem>
          {lifecycle.length > 0 && <DropdownMenuSeparator />}
          {lifecycle}
          {version.status === "live" && isDefault && can.publishCatalog && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">Make another version the default to deprecate this one.</p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}

/** Every version of the model, newest first, with what can happen to each next. */
export function VersionsTab({ model, onManage }: { model: Model; onManage: (versionId: string, tab: ModelTab) => void }) {
  const can = usePermissions();
  const [creating, setCreating] = useState(false);
  const [deprecating, setDeprecating] = useState<ModelVersion | null>(null);

  const columns: Column<ModelVersion>[] = [
    {
      id: "version",
      header: "Version",
      className: "min-w-56",
      cell: (v) => (
        <span className="block min-w-0">
          <span className="flex items-center gap-2">
            <span className="font-mono font-medium">{v.id}</span>
            <span className="text-muted-foreground">{v.label}</span>
            {v.id === model.defaultVersion && <Pill tone="info">Default</Pill>}
          </span>
          {v.changelog && (
            <span className="block max-w-md truncate text-xs text-muted-foreground" title={v.changelog}>
              {v.changelog}
            </span>
          )}
        </span>
      ),
    },
    { id: "status", header: "Status", cell: (v) => <VersionStatusPill status={v.status} /> },
    {
      id: "routes",
      header: "Routes",
      align: "right",
      cell: (v) => {
        const active = v.routes.filter((r) => r.status === "active").length;
        return (
          <span className={active === 0 && v.status !== "retired" ? "font-medium text-status-critical" : "tabular"}>
            {active}
            <span className="text-muted-foreground"> / {v.routes.length}</span>
          </span>
        );
      },
    },
    {
      id: "price",
      header: "Price",
      align: "right",
      cell: (v) => {
        const tier = defaultTier(v.pricing);
        return tier ? (
          <span className="whitespace-nowrap tabular">
            {unitPrice(tier.price)}
            <span className="text-muted-foreground">{UNIT_SHORT[v.pricing.unit]}</span>
          </span>
        ) : (
          "—"
        );
      },
    },
    { id: "requests", header: "Requests 24h", align: "right", cell: (v) => <span className="tabular">{integer(v.requests24h)}</span> },
    { id: "released", header: "Released", cell: (v) => <DateTime value={v.releasedAt} time={false} /> },
    {
      id: "sunset",
      header: "Sunset",
      cell: (v) =>
        v.sunsetAt ? (
          <span className="flex flex-col leading-tight">
            <DateTime value={v.sunsetAt} time={false} />
            {v.replacement && <span className="text-xs text-muted-foreground">→ {v.replacement}</span>}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      className: "w-12",
      cell: (v) => <RowActions model={model} version={v} onManage={onManage} onDeprecate={setDeprecating} />,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Lifecycle />
      <div className="flex flex-col overflow-hidden rounded-lg border bg-card">
        <div className="flex items-center gap-2 border-b px-4 py-2.5">
          <h2 className="flex-1 text-sm font-semibold">Versions</h2>
          {can.editCatalog && (
            <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
              <Plus /> New version
            </Button>
          )}
        </div>
        <DataTable
          label="Versions"
          columns={columns}
          rows={model.versionList}
          rowKey={(v) => v.id}
          onRowClick={(v) => onManage(v.id, "routing")}
          className="flex-none"
          empty={<EmptyState title="No versions" description="Add a version to give the model a schema, a price and routes." />}
        />
      </div>
      <NewVersionDialog model={model} open={creating} onOpenChange={setCreating} />
      <DeprecateDialog model={model} version={deprecating} onClose={() => setDeprecating(null)} />
    </div>
  );
}
