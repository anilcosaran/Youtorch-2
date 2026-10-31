"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Ellipsis, GitBranchPlus, History, OctagonPause, Play, Undo2 } from "lucide-react";
import { toast } from "sonner";
import {
  createRelease,
  getApp,
  pauseApp,
  publishRelease,
  resumeApp,
  rollbackApp,
  type App,
  type AppRelease,
  type AppStep,
} from "@modelvend/admin-api/apps";
import { errorMessage } from "@modelvend/admin-api/client";
import { ErrorState } from "@/components/data/states";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { useConfirm } from "@/components/shared/confirm";
import { DetailSection } from "@/components/shared/detail-section";
import { PublishDialog } from "@/components/shared/publish-dialog";
import { ReasonDialog } from "@/components/shared/reason-dialog";
import { StatTile } from "@/components/shared/stat-tile";
import { AppStatusPill, ReleaseStatusPill } from "@/components/shared/status";
import { DateTime, RelativeTime } from "@/components/shared/time";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { margin, modelHref, parsePinned } from "@/lib/catalog";
import { integer, percent, plural, usdCompact, usdPrecise } from "@/lib/format";
import { APP_CATEGORY_LABELS } from "@/lib/labels";
import { toastError } from "@/lib/notify";
import { keys } from "@/lib/query-keys";
import { usePermissions } from "@/lib/session";
import { AppSchemas } from "./app-schemas";
import { ReleaseEditor } from "./release-editor";
import { useApplyApp, useRefreshApp } from "./use-apply-app";

/** The steps of a release as a left-to-right chain. */
function Pipeline({ steps }: { steps: AppStep[] }) {
  if (steps.length === 0) return <p className="text-sm text-muted-foreground">No steps yet.</p>;
  return (
    <ol className="flex flex-wrap items-stretch gap-2" aria-label="Steps">
      {steps.map((step, i) => {
        const { modelId, version } = parsePinned(step.model);
        return (
          <li key={step.id} className="flex items-center gap-2">
            {i > 0 && <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
            <div className="rounded-lg border bg-background px-3 py-2">
              <div className="text-xs text-muted-foreground">
                Step {i + 1}
                {step.stage && ` · ${step.stage}`}
              </div>
              <div className="font-mono text-sm font-medium">{step.id}</div>
              <Link href={modelHref(modelId, version)} className="font-mono text-xs text-muted-foreground hover:text-foreground hover:underline">
                {step.model}
              </Link>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ReleaseRow({
  app,
  release,
  onDeploy,
  onRollback,
}: {
  app: App;
  release: AppRelease;
  onDeploy: (release: AppRelease) => void;
  onRollback: (release: AppRelease) => void;
}) {
  const can = usePermissions();
  const share = margin(release.priceMicros, release.costMicros);
  return (
    <li className="grid gap-3 border-b px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-semibold">#{release.number}</span>
        <ReleaseStatusPill status={release.status} />
        <span className="text-xs text-muted-foreground">
          {release.publishedAt ? (
            <>
              Deployed <RelativeTime value={release.publishedAt} />
            </>
          ) : (
            <>
              Created <RelativeTime value={release.createdAt} />
            </>
          )}
          {release.createdBy && ` · drafted by ${release.createdBy}`}
        </span>
        <span className="ml-auto text-xs tabular">
          {usdPrecise(release.priceMicros)} / run
          <span className="text-muted-foreground">
            {" "}
            · cost {usdPrecise(release.costMicros)}
            {share !== null && ` · ${percent(share, 0)} margin`}
          </span>
        </span>
        {can.publishCatalog && release.status === "superseded" && app.liveRelease !== null && (
          <Button variant="outline" size="xs" onClick={() => onRollback(release)}>
            <Undo2 /> Roll back to this
          </Button>
        )}
        {can.publishCatalog && release.status === "draft" && (
          <Button size="xs" onClick={() => onDeploy(release)} disabled={release.steps.length === 0}>
            Deploy
          </Button>
        )}
      </div>
      <Pipeline steps={release.steps} />
      {release.stages.length > 0 && <p className="text-xs text-muted-foreground">Stages: {release.stages.join(" → ")}</p>}
      {release.notes && <p className="text-xs text-muted-foreground">{release.notes}</p>}
    </li>
  );
}

function Actions({ app }: { app: App }) {
  const can = usePermissions();
  const confirm = useConfirm();
  const apply = useApplyApp();
  const refresh = useRefreshApp();
  const [pausing, setPausing] = useState(false);

  const draft = async () => {
    try {
      apply(await createRelease(app.slug));
      toast.success("Draft release created", { description: app.liveRelease ? `Copied from #${app.liveRelease}.` : undefined });
    } catch (error) {
      toastError(error, "Couldn't create a release");
      refresh(app.slug);
    }
  };

  const resume = async () => {
    const ok = await confirm({ title: `Resume ${app.name}?`, description: "Customers can run it again at once.", action: "Resume" });
    if (!ok) return;
    try {
      apply(await resumeApp(app.slug));
      toast.success(`${app.name} is running again`);
    } catch (error) {
      toastError(error, "Couldn't resume the app");
      refresh(app.slug);
    }
  };

  return (
    <>
      {can.editCatalog && (
        <Button variant="outline" onClick={() => void draft()} disabled={app.draftRelease !== null} title={app.draftRelease !== null ? `Release #${app.draftRelease} is already in draft` : undefined}>
          <GitBranchPlus /> New release
        </Button>
      )}
      {can.publishCatalog && app.status !== "draft" &&
        (app.status === "paused" ? (
          <Button variant="outline" onClick={() => void resume()}>
            <Play /> Resume
          </Button>
        ) : (
          <Button variant="outline" onClick={() => setPausing(true)}>
            <OctagonPause /> Pause
          </Button>
        ))}
      {can.viewAudit && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="More actions">
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link href={`/audit?targetType=app&targetId=${encodeURIComponent(app.slug)}`}>
                <History /> Audit trail
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <ReasonDialog
        open={pausing}
        onOpenChange={setPausing}
        title={`Pause ${app.name}?`}
        description="New runs fail with 503 app_paused; runs in progress finish. The models it uses aren't affected."
        label="Reason"
        required
        action="Pause app"
        destructive
        describeError={errorMessage}
        onSubmit={async (reason) => {
          try {
            apply(await pauseApp(app.slug, reason));
            setPausing(false);
            toast.success(`${app.name} is paused`);
          } catch (error) {
            refresh(app.slug);
            throw error;
          }
        }}
      />
    </>
  );
}

/** An app's page: its live pipeline, the draft being prepared and every release before. */
export function AppDetail({ slug }: { slug: string }) {
  const can = usePermissions();
  const confirm = useConfirm();
  const apply = useApplyApp();
  const refresh = useRefreshApp();
  const app = useQuery({ queryKey: keys.app(slug), queryFn: () => getApp(slug) });
  const [deploying, setDeploying] = useState<AppRelease | null>(null);
  const data = app.data;
  const live = data?.releases.find((r) => r.status === "live");
  const draft = data?.releases.find((r) => r.status === "draft");

  // Deploying or rolling back never lifts a pause: the release becomes the live one, and resuming stays a separate step.
  const paused = data?.status === "paused";
  const stillPaused = (number: number) =>
    `${data?.name ?? "The app"} stays paused: #${number} becomes the live release, but runs keep failing with 503 app_paused until you resume the app.`;

  const deploy = async (release: AppRelease, reason: string | undefined) => {
    try {
      const updated = await publishRelease(slug, release.number, reason ? { reason } : {});
      apply(updated);
      setDeploying(null);
      toast.success(`Release #${release.number} is the live release`, {
        description: updated.status === "paused" ? `${updated.name} is still paused; resume it to take runs.` : undefined,
      });
    } catch (error) {
      refresh(slug);
      throw error;
    }
  };

  const rollback = async (release: AppRelease) => {
    if (!data) return;
    const ok = await confirm({
      title: `Roll back to release #${release.number}?`,
      description: paused
        ? `${stillPaused(release.number)} #${live?.number} is superseded.`
        : `It goes live again and #${live?.number} is superseded. New runs use #${release.number} at once.`,
      action: paused ? "Roll back, stay paused" : "Roll back",
      destructive: true,
    });
    if (!ok) return;
    try {
      const updated = await rollbackApp(data.slug, release.number);
      apply(updated);
      toast.success(`Rolled back to #${release.number}`, {
        description: updated.status === "paused" ? `${updated.name} is still paused; resume it to take runs.` : undefined,
      });
    } catch (error) {
      toastError(error, "Couldn't roll back");
      refresh(slug);
    }
  };

  return (
    <>
      <PageHeader
        parent={{ href: "/apps", label: "Apps" }}
        title={data?.name ?? slug}
        description={
          data ? (
            <>
              <span className="font-mono">apps/{data.slug}</span> · {APP_CATEGORY_LABELS[data.category]} · {data.tagline}
            </>
          ) : undefined
        }
      >
        {data && <Actions app={data} />}
      </PageHeader>
      <PageBody className="flex flex-col gap-4">
        {app.error && !data ? (
          <ErrorState error={app.error} onRetry={() => void app.refetch()} retrying={app.isFetching} className="rounded-lg border bg-card" />
        ) : !data ? (
          <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
            <Skeleton className="h-[98px] rounded-lg" />
            <Skeleton className="h-64 rounded-lg" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <AppStatusPill status={data.status} />
              <span className="text-xs text-muted-foreground">
                Updated <DateTime value={data.updatedAt} />
              </span>
            </div>
            {data.status === "paused" && (
              <div role="status" className="rounded-lg border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm">
                <p className="font-medium">Paused: every new run gets 503 app_paused</p>
                {data.pausedReason && <p className="mt-0.5 text-muted-foreground">{data.pausedReason}</p>}
                <p className="mt-0.5 text-muted-foreground">Deploying or rolling back keeps it paused; resume it to take runs again.</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile
                label="Live release"
                value={live ? `#${live.number}` : "—"}
                hint={live ? plural(live.steps.length, "step") : "Not deployed yet"}
              />
              <StatTile
                label="Price per run"
                value={live ? usdPrecise(live.priceMicros) : "—"}
                hint={live ? `Cost ${usdPrecise(live.costMicros)} · ${percent(margin(live.priceMicros, live.costMicros) ?? 0, 0)} margin` : undefined}
              />
              <StatTile label="Runs 24h" value={integer(data.runs24h)} />
              <StatTile label="Revenue 30d" value={usdCompact(data.revenue30dMicros)} />
            </div>
            {draft && can.editCatalog && (
              <ReleaseEditor
                key={`${draft.number}:${JSON.stringify([draft.steps, draft.stages, draft.outputMap, draft.priceMicros, draft.notes])}`}
                app={data}
                release={draft}
                onDeploy={can.publishCatalog ? () => setDeploying(draft) : undefined}
              />
            )}
            <AppSchemas app={data} />
            <DetailSection title="Releases" bodyClassName="p-0">
              <ol aria-label="Releases">
                {data.releases.map((release) => (
                  <ReleaseRow key={release.number} app={data} release={release} onDeploy={setDeploying} onRollback={(r) => void rollback(r)} />
                ))}
              </ol>
            </DetailSection>
          </>
        )}
      </PageBody>
      <PublishDialog
        open={deploying !== null}
        onOpenChange={(open) => !open && setDeploying(null)}
        title={`Deploy release #${deploying?.number ?? ""}?`}
        description={
          !deploying
            ? undefined
            : paused
              ? `${stillPaused(deploying.number)}${live ? ` #${live.number} is superseded; you can roll back to it later.` : ""}`
              : live
                ? `New runs use it at once; runs in progress finish on #${live.number}. You can roll back to #${live.number} later.`
                : `${data?.name ?? "The app"} goes live and customers can run it.`
        }
        action={paused ? "Deploy, stay paused" : "Deploy"}
        onPublish={(reason) => (deploying ? deploy(deploying, reason) : Promise.resolve())}
      />
    </>
  );
}
