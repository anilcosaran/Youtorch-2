"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Copy, Ellipsis, History, OctagonPause, Play } from "lucide-react";
import { errorMessage } from "@modelvend/admin-api/client";
import { getModel, pauseModel, resumeModel, type Model } from "@modelvend/admin-api/models";
import { ErrorState } from "@/components/data/states";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { copyText } from "@/components/shared/copy-field";
import { useConfirm } from "@/components/shared/confirm";
import { ReasonDialog } from "@/components/shared/reason-dialog";
import { StatTile } from "@/components/shared/stat-tile";
import { ModelStatePill, VersionStatusPill, VisibilityPill } from "@/components/shared/status";
import { RelativeTime } from "@/components/shared/time";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { pickVersion } from "@/lib/catalog";
import { integer, percent, plural, usdCompact } from "@/lib/format";
import { MODALITY_LABELS } from "@/lib/labels";
import { keys } from "@/lib/query-keys";
import { usePermissions } from "@/lib/session";
import { pick, useUrlState } from "@/lib/use-url-state";
import { DetailsTab } from "./details-tab";
import { PricingTab } from "./pricing-tab";
import { RoutingTab } from "./routing-tab";
import { SchemaTab } from "./schema-tab";
import { useApplyModel, useModelAction, useRefreshModel } from "./use-model-action";
import { VersionsTab } from "./versions-tab";

const TABS = ["versions", "routing", "pricing", "schema", "details"] as const;
export type ModelTab = (typeof TABS)[number];

const TAB_LABELS: Record<ModelTab, string> = {
  versions: "Versions",
  routing: "Routing",
  pricing: "Pricing",
  schema: "Schema",
  details: "Details",
};

function Actions({ model }: { model: Model }) {
  const can = usePermissions();
  const confirm = useConfirm();
  const run = useModelAction(model.id);
  const apply = useApplyModel();
  const refresh = useRefreshModel();
  const [pausing, setPausing] = useState(false);

  const resume = async () => {
    const ok = await confirm({
      title: `Resume ${model.name}?`,
      description: "It takes new tasks again at once, and the ones still queued can start.",
      action: "Resume",
    });
    if (ok) await run(() => resumeModel(model.id), `${model.name} is taking tasks again`, "Couldn't resume the model");
  };

  return (
    <>
      {can.publishCatalog &&
        (model.state === "paused" ? (
          <Button variant="outline" onClick={() => void resume()}>
            <Play /> Resume
          </Button>
        ) : (
          <Button variant="outline" onClick={() => setPausing(true)}>
            <OctagonPause /> Pause
          </Button>
        ))}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="More actions">
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => void copyText(model.id, "Model ID")}>
            <Copy /> Copy model ID
          </DropdownMenuItem>
          {can.viewAudit && (
            <DropdownMenuItem asChild>
              <Link href={`/audit?targetType=model&targetId=${encodeURIComponent(model.id)}`}>
                <History /> Audit trail
              </Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ReasonDialog
        open={pausing}
        onOpenChange={setPausing}
        title={`Pause ${model.name}?`}
        description="New tasks get 503 model_paused. Running tasks finish; queued ones wait, and fail with queue_timeout after the queue wait limit unless you resume it. The model stays readable. Use it when a model misbehaves or every provider is down."
        label="Reason"
        placeholder="Shown to operators and in the audit log"
        required
        action="Pause model"
        destructive
        describeError={errorMessage}
        onSubmit={async (reason) => {
          try {
            apply(await pauseModel(model.id, reason));
            setPausing(false);
          } catch (error) {
            refresh(model.id);
            throw error;
          }
        }}
      />
    </>
  );
}

function Tiles({ model }: { model: Model }) {
  const live = model.versionList.filter((v) => v.status === "live").length;
  const defaultVersion = model.versionList.find((v) => v.id === model.defaultVersion);
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile
        label="Default version"
        value={<span className="font-mono">{model.defaultVersion ?? "—"}</span>}
        hint={defaultVersion ? `${defaultVersion.label} · ${plural(live, "live version")}` : "Nothing live yet"}
        info="What unpinned tasks get. Callers pin another with publisher/slug@version."
      />
      <StatTile label="Tasks 24h" value={integer(model.tasks24h)} hint={`${plural(model.versions.total, "version")}`} />
      <StatTile
        label="Error rate 24h"
        value={model.errorRate24h === null ? "—" : percent(model.errorRate24h)}
        tone={model.errorRate24h !== null && model.errorRate24h > 0.05 ? "attention" : undefined}
        hint="Tasks that failed after every fallback"
      />
      <StatTile label="Revenue 30d" value={usdCompact(model.revenue30dMicros)} hint="Purchased-credit usage minus refunds, all versions" />
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[98px] rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-9 w-96 max-w-full" />
      <Skeleton className="h-80 rounded-lg" />
    </div>
  );
}

/** A model's page: its versions and, for the version picked, routes, price and schema. */
export function ModelDetail({ id }: { id: string }) {
  const { get, set } = useUrlState();
  const tab = pick(get("tab"), TABS) ?? "versions";
  const model = useQuery({ queryKey: keys.model(id), queryFn: () => getModel(id) });
  const data = model.data;
  const version = data ? pickVersion(data, get("version")) : undefined;

  const show = (next: ModelTab, versionId?: string) =>
    set({ tab: next === "versions" ? null : next, ...(versionId ? { version: versionId } : {}) });

  return (
    <>
      <PageHeader
        parent={{ href: "/models", label: "Models" }}
        title={data?.name ?? id}
        description={
          data ? (
            <>
              <span className="font-mono">{data.id}</span> · {MODALITY_LABELS[data.modality]}
              {data.tasks.length > 0 && ` · ${data.tasks.join(", ")}`}
            </>
          ) : undefined
        }
      >
        {data && <Actions model={data} />}
      </PageHeader>
      <PageBody className="flex flex-col gap-4">
        {model.error && !data ? (
          <ErrorState
            error={model.error}
            onRetry={() => void model.refetch()}
            retrying={model.isFetching}
            className="rounded-lg border bg-card"
          />
        ) : !data ? (
          <DetailSkeleton />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <ModelStatePill state={data.state} />
              <VisibilityPill visibility={data.visibility} />
              {version && version.id !== data.defaultVersion && tab !== "versions" && tab !== "details" && (
                <span className="text-xs text-muted-foreground">
                  Showing <span className="font-mono">{version.id}</span> <VersionStatusPill status={version.status} />
                </span>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                Created <RelativeTime value={data.createdAt} />
              </span>
            </div>
            {data.state === "paused" && (
              <div role="status" className="rounded-lg border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm">
                <p className="font-medium">Paused: new tasks get 503 model_paused</p>
                {data.pausedReason && <p className="mt-0.5 text-muted-foreground">{data.pausedReason}</p>}
                <p className="mt-0.5 text-muted-foreground">
                  Running tasks finish. Queued ones wait, and fail with queue_timeout after the queue wait limit unless you resume it.
                </p>
              </div>
            )}
            <Tiles model={data} />
            <Tabs value={tab} onValueChange={(value) => show(value as ModelTab)} className="gap-4">
              <div className="-mx-1 overflow-x-auto overflow-y-hidden px-1 pb-0.5 shadow-[inset_0_-1px_0_var(--border)] [scrollbar-width:none]">
                <TabsList variant="line">
                  {TABS.map((value) => (
                    <TabsTrigger key={value} value={value} className="px-2.5">
                      {TAB_LABELS[value]}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
              <TabsContent value="versions">
                <VersionsTab model={data} onManage={(versionId, next) => show(next, versionId)} />
              </TabsContent>
              <TabsContent value="routing">
                {version && <RoutingTab model={data} version={version} onPick={(v) => set({ version: v })} />}
              </TabsContent>
              <TabsContent value="pricing">
                {version && (
                  <PricingTab
                    model={data}
                    version={version}
                    onPick={(v) => set({ version: v })}
                    onNewVersion={() => show("versions")}
                  />
                )}
              </TabsContent>
              <TabsContent value="schema">
                {version && <SchemaTab model={data} version={version} onPick={(v) => set({ version: v })} />}
              </TabsContent>
              <TabsContent value="details">
                {/* Keyed by model only: a refetch must not wipe edits in progress. */}
                <DetailsTab key={data.id} model={data} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </PageBody>
    </>
  );
}
