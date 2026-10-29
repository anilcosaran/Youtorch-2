"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Ellipsis, LoaderCircle, Pause, Pencil, Play, Plus, Trash } from "lucide-react";
import {
  deleteRoute,
  ROUTING_STRATEGIES,
  updateRoute,
  updateVersion,
  type Model,
  type ModelVersion,
  type Route,
  type RoutingPolicy,
  type RoutingStrategy,
} from "@modelvend/admin-api/models";
import { listProviders } from "@modelvend/admin-api/providers";
import { DataTable, type Column } from "@/components/data/data-table";
import { EmptyState } from "@/components/data/states";
import { useConfirm } from "@/components/shared/confirm";
import { DetailSection } from "@/components/shared/detail-section";
import { Field } from "@/components/shared/field";
import { Pill } from "@/components/shared/pill";
import { RouteStatusPill } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { defaultTier, marginTone, routeMargin, soldPrice } from "@/lib/catalog";
import { integer, milliseconds, percent, unitPrice } from "@/lib/format";
import { STRATEGY_DESCRIPTIONS, STRATEGY_LABELS, UNIT_LABELS, UNIT_SHORT } from "@/lib/labels";
import { keys } from "@/lib/query-keys";
import { usePermissions } from "@/lib/session";
import { cn } from "@/lib/utils";
import { RouteDialog } from "./route-dialog";
import { useModelAction } from "./use-model-action";
import { VersionBar } from "./version-picker";

const TONE_TEXT = {
  good: "",
  neutral: "text-muted-foreground",
  warning: "font-medium text-status-warning",
  critical: "font-medium text-status-critical",
} as const;

function PolicyForm({ model, version }: { model: Model; version: ModelVersion }) {
  const can = usePermissions();
  const run = useModelAction();
  const [draft, setDraft] = useState<RoutingPolicy>(version.routing);
  const [saving, setSaving] = useState(false);
  const locked = !can.editCatalog || version.status === "retired";
  const changed = JSON.stringify(draft) !== JSON.stringify(version.routing);
  const invalid = draft.maxAttempts < 1 || draft.maxAttempts > 5 || draft.timeoutSeconds < 5 || draft.timeoutSeconds > 3600;

  const save = async () => {
    setSaving(true);
    await run(() => updateVersion(model.id, version.id, { routing: draft }), "Routing saved", "Couldn't save the routing");
    setSaving(false);
  };

  return (
    <DetailSection
      title="Routing policy"
      action={
        !locked && (
          <Button size="sm" disabled={!changed || invalid || saving} onClick={() => void save()}>
            {saving && <LoaderCircle className="animate-spin" />}
            Save
          </Button>
        )
      }
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
        <Field id="strategy" label="Strategy" hint={STRATEGY_DESCRIPTIONS[draft.strategy]}>
          <Select
            value={draft.strategy}
            onValueChange={(value) => setDraft({ ...draft, strategy: value as RoutingStrategy })}
            disabled={locked}
          >
            <SelectTrigger id="strategy" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROUTING_STRATEGIES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STRATEGY_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id="fallbacks" label="Fallbacks" hint="Try the next route when one fails before output.">
          <div className="flex h-8 items-center">
            <Switch
              id="fallbacks"
              checked={draft.fallbacks}
              onCheckedChange={(fallbacks) => setDraft({ ...draft, fallbacks })}
              disabled={locked}
            />
          </div>
        </Field>
        <Field id="attempts" label="Max attempts" hint="1 to 5, across routes.">
          <Input
            id="attempts"
            type="number"
            min={1}
            max={5}
            value={draft.maxAttempts}
            onChange={(e) => setDraft({ ...draft, maxAttempts: Number(e.target.value) })}
            disabled={locked || !draft.fallbacks}
          />
        </Field>
        <Field id="timeout" label="Timeout (s)" hint="Per attempt, 5 to 3600.">
          <Input
            id="timeout"
            type="number"
            min={5}
            max={3600}
            value={draft.timeoutSeconds}
            onChange={(e) => setDraft({ ...draft, timeoutSeconds: Number(e.target.value) })}
            disabled={locked}
          />
        </Field>
      </div>
    </DetailSection>
  );
}

function RouteActions({
  model,
  version,
  route,
  onEdit,
}: {
  model: Model;
  version: ModelVersion;
  route: Route;
  onEdit: (route: Route) => void;
}) {
  const confirm = useConfirm();
  const run = useModelAction();
  const at = `${model.id}@${version.id}`;

  const setStatus = async (status: Route["status"]) => {
    if (status !== "active") {
      const ok = await confirm({
        title: status === "paused" ? `Pause the ${route.providerName} route?` : `Drain the ${route.providerName} route?`,
        description:
          status === "paused"
            ? `New requests to ${at} skip it at once; attempts in flight finish.`
            : `It finishes what it has and takes nothing new, so you can remove it without failing requests.`,
        action: status === "paused" ? "Pause route" : "Drain route",
      });
      if (!ok) return;
    }
    await run(
      () => updateRoute(model.id, version.id, route.id, { status }),
      status === "active" ? "Route active" : status === "paused" ? "Route paused" : "Route draining",
      "Couldn't change the route",
    );
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Remove the ${route.providerName} route?`,
      description: `${at} stops using ${route.upstreamModel}. Its history stays in the request log.`,
      action: "Remove route",
      destructive: true,
    });
    if (ok) await run(() => deleteRoute(model.id, version.id, route.id), "Route removed", "Couldn't remove the route");
  };

  return (
    <span onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for the ${route.providerName} route`}>
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => onEdit(route)}>
            <Pencil /> Edit
          </DropdownMenuItem>
          {route.status === "active" ? (
            <>
              <DropdownMenuItem onSelect={() => void setStatus("paused")}>
                <Pause /> Pause
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void setStatus("draining")}>Drain</DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem onSelect={() => void setStatus("active")}>
              <Play /> Make active
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => void remove()}>
            <Trash /> Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}

/** Where a version's requests go: the policy that orders routes, and the routes themselves. */
export function RoutingTab({ model, version, onPick }: { model: Model; version: ModelVersion; onPick: (id: string) => void }) {
  const can = usePermissions();
  const providers = useQuery({ queryKey: keys.providers, queryFn: listProviders, enabled: can.viewProviders });
  const [editing, setEditing] = useState<Route | "new" | null>(null);
  const editable = can.editCatalog && version.status !== "retired";
  const tier = defaultTier(version.pricing);
  const providerStatus = (id: string) => providers.data?.find((p) => p.id === id)?.status;
  const routes = [...version.routes].sort((a, b) => a.priority - b.priority || b.weight - a.weight);

  const columns: Column<Route>[] = [
    {
      id: "priority",
      header: version.routing.strategy === "weighted" ? "Priority · weight" : "Priority",
      className: "w-28",
      cell: (r) => (
        <span className="tabular">
          {r.priority}
          {version.routing.strategy === "weighted" && <span className="text-muted-foreground"> · {r.weight}%</span>}
        </span>
      ),
    },
    {
      id: "provider",
      header: "Provider",
      className: "min-w-64",
      cell: (r) => (
        <span className="block min-w-0">
          <span className="flex items-center gap-2">
            <span className="font-medium">{r.providerName}</span>
            {providerStatus(r.providerId) && providerStatus(r.providerId) !== "active" && (
              <Pill tone="critical" title="The provider is paused, so this route is skipped">
                Provider paused
              </Pill>
            )}
          </span>
          <span className="block truncate font-mono text-xs text-muted-foreground" title={r.upstreamModel}>
            {r.upstreamModel}
          </span>
        </span>
      ),
    },
    { id: "status", header: "Status", cell: (r) => <RouteStatusPill status={r.status} /> },
    {
      id: "cost",
      header: "Cost",
      align: "right",
      cell: (r) => (
        <span className="whitespace-nowrap tabular">
          {unitPrice(r.cost.price)}
          <span className="text-muted-foreground">{UNIT_SHORT[r.cost.unit]}</span>
        </span>
      ),
    },
    {
      id: "margin",
      header: "Margin",
      align: "right",
      cell: (r) => {
        if (r.cost.unit !== version.pricing.unit) {
          return (
            <span
              className="font-medium text-status-warning"
              title={`This route costs ${UNIT_SHORT[r.cost.unit]} but the version bills ${UNIT_SHORT[version.pricing.unit]}; enter its cost in the version's unit.`}
            >
              Other unit
            </span>
          );
        }
        const share = routeMargin(version.pricing, r.cost);
        return <span className={cn("tabular", TONE_TEXT[marginTone(share)])}>{share === null ? "—" : percent(share, 0)}</span>;
      },
    },
    {
      id: "success",
      header: "Success 24h",
      align: "right",
      cell: (r) =>
        r.health.successRate === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className={cn("tabular", r.health.successRate < 0.95 && "font-medium text-status-critical")}>
            {percent(r.health.successRate)}
          </span>
        ),
    },
    {
      id: "latency",
      header: "p50 · p95",
      align: "right",
      cell: (r) =>
        r.health.p50Ms === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="whitespace-nowrap tabular">
            {milliseconds(r.health.p50Ms)}
            {r.health.p95Ms !== null && <span className="text-muted-foreground"> · {milliseconds(r.health.p95Ms)}</span>}
          </span>
        ),
    },
    { id: "requests", header: "Requests 24h", align: "right", cell: (r) => <span className="tabular">{integer(r.health.requests24h)}</span> },
    { id: "region", header: "Region", cell: (r) => <span className="uppercase">{r.region}</span> },
  ];
  if (editable) {
    columns.push({
      id: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      className: "w-12",
      cell: (r) => <RouteActions model={model} version={version} route={r} onEdit={setEditing} />,
    });
  }

  const active = version.routes.filter((r) => r.status === "active").length;
  const otherUnit = version.routes.filter((r) => r.cost.unit !== version.pricing.unit).length;

  return (
    <div className="flex flex-col gap-4">
      <VersionBar model={model} version={version} onPick={onPick}>
        {editable &&
          (can.viewProviders ? (
            <Button size="sm" onClick={() => setEditing("new")} disabled={providers.isPending}>
              <Plus /> Add route
            </Button>
          ) : (
            // Picking a provider means seeing the providers; without that access there is nothing to pick from.
            <span className="text-xs text-muted-foreground">Adding a route needs access to view providers.</span>
          ))}
      </VersionBar>
      {version.status === "live" && active === 0 && (
        <p role="alert" className="rounded-lg bg-status-critical/10 px-3 py-2 text-sm text-status-critical">
          No active route: every request to this version fails. Add or resume a route.
        </p>
      )}
      {otherUnit > 0 && (
        <p role="status" className="rounded-lg bg-status-warning/10 px-3 py-2 text-sm">
          {otherUnit === 1 ? "A route costs" : `${otherUnit} routes cost`} in another unit than {version.id} bills (per{" "}
          {UNIT_LABELS[version.pricing.unit]}), so {otherUnit === 1 ? "its" : "their"} margin can&apos;t be shown and the version
          can&apos;t be promoted until {otherUnit === 1 ? "it costs" : "each costs"} per {UNIT_LABELS[version.pricing.unit]}.
        </p>
      )}
      <PolicyForm key={`${version.id}:${JSON.stringify(version.routing)}`} model={model} version={version} />
      <div className="flex flex-col overflow-hidden rounded-lg border bg-card">
        <div className="flex items-center gap-2 border-b px-4 py-2.5">
          <h2 className="flex-1 text-sm font-semibold">Routes</h2>
          <span className="text-xs text-muted-foreground">
            Margins at the default tier
            {tier &&
              ` (${tier.label}, ${unitPrice(soldPrice(version.pricing, tier.price))}${UNIT_SHORT[version.pricing.unit]}${
                version.pricing.promo ? ` after the ${percent(version.pricing.promo, 0)} promo` : ""
              })`}
          </span>
        </div>
        <DataTable
          label="Routes"
          columns={columns}
          rows={routes}
          rowKey={(r) => r.id}
          onRowClick={editable ? setEditing : undefined}
          className="flex-none"
          empty={
            <EmptyState
              title="No routes"
              description="A route sends this version's requests to a provider's model. Add one before it goes live."
            />
          }
        />
      </div>
      <RouteDialog
        model={model}
        version={version}
        route={editing === "new" ? null : editing}
        open={editing !== null}
        providers={providers.data ?? []}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
