"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Ellipsis, KeyRound, OctagonPause, Pencil, Play, Plus, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@modelvend/admin-api/client";
import {
  checkProvider,
  listProviders,
  pauseProvider,
  resumeProvider,
  type HealthState,
  type Provider,
} from "@modelvend/admin-api/providers";
import { EmptyState, ErrorState } from "@/components/data/states";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { useConfirm } from "@/components/shared/confirm";
import { InfoTip } from "@/components/shared/info-tip";
import { Pill } from "@/components/shared/pill";
import { ReasonDialog } from "@/components/shared/reason-dialog";
import { HealthPill, ProviderStatusPill } from "@/components/shared/status";
import { RelativeTime } from "@/components/shared/time";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { integer, milliseconds, percent, plural, usd, usdCompact } from "@/lib/format";
import { toastError } from "@/lib/notify";
import { ADAPTER_LABELS, PROVIDER_KIND_DESCRIPTIONS, PROVIDER_KIND_LABELS } from "@/lib/labels";
import { keys } from "@/lib/query-keys";
import { usePermissions } from "@/lib/session";
import { CredentialDialog, ProviderDialog } from "./provider-dialogs";

const ACCENT: Record<HealthState, string> = {
  operational: "var(--status-good)",
  degraded: "var(--status-warning)",
  outage: "var(--status-critical)",
};

/** Puts a provider a change returned in the cache; model pages show its status and the audit log the change, so they load again. */
function useApplyProvider() {
  const queryClient = useQueryClient();
  return (provider: Provider) => {
    queryClient.setQueryData<Provider[]>(keys.providers, (list) => list?.map((p) => (p.id === provider.id ? provider : p)));
    void queryClient.invalidateQueries({ queryKey: keys.models });
    void queryClient.invalidateQueries({ queryKey: keys.audit });
  };
}

function Label({ text, info }: { text: string; info?: React.ReactNode }) {
  return (
    <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      {text}
      {info && <InfoTip label={text}>{info}</InfoTip>}
    </div>
  );
}

function Figure({ label, value, info }: { label: string; value: React.ReactNode; info?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <Label text={label} info={info} />
      <div className="truncate text-sm font-medium tabular">{value}</div>
    </div>
  );
}

function CardActions({
  provider,
  onEdit,
  onCredential,
  onPause,
}: {
  provider: Provider;
  onEdit: () => void;
  onCredential: () => void;
  onPause: () => void;
}) {
  const confirm = useConfirm();
  const apply = useApplyProvider();
  const [checking, setChecking] = useState(false);

  const check = async () => {
    setChecking(true);
    try {
      const result = await checkProvider(provider.id);
      apply(result.provider);
      if (result.ok) toast.success(`${provider.name} answered in ${milliseconds(result.latencyMs)}`, { description: result.message });
      else toast.error(`${provider.name} didn't answer properly`, { description: result.message });
    } catch (error) {
      toastError(error, "Couldn't check the provider");
    } finally {
      setChecking(false);
    }
  };

  const resume = async () => {
    const ok = await confirm({
      title: `Resume ${provider.name}?`,
      description: "Its active routes take new attempts again at once.",
      action: "Resume",
    });
    if (!ok) return;
    try {
      apply(await resumeProvider(provider.id));
      toast.success(`${provider.name} is taking requests again`);
    } catch (error) {
      toastError(error, "Couldn't resume the provider");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${provider.name}`}>
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={() => void check()} disabled={checking || !provider.credential.configured}>
          <Stethoscope /> Check connection
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onCredential}>
          <KeyRound /> {provider.credential.configured ? "Rotate key" : "Set key"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil /> Edit
        </DropdownMenuItem>
        {provider.status !== "disabled" && <DropdownMenuSeparator />}
        {provider.status === "active" && (
          <DropdownMenuItem variant="destructive" onSelect={onPause}>
            <OctagonPause /> Pause
          </DropdownMenuItem>
        )}
        {provider.status === "paused" && (
          <DropdownMenuItem onSelect={() => void resume()}>
            <Play /> Resume
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProviderCard({ provider }: { provider: Provider }) {
  const can = usePermissions();
  const apply = useApplyProvider();
  const [editing, setEditing] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [pausing, setPausing] = useState(false);
  const { health, credential, limits } = provider;

  return (
    <section className="relative flex flex-col overflow-hidden rounded-lg border bg-card">
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: provider.status === "active" ? ACCENT[health.state] : "var(--muted-foreground)" }}
      />
      <header className="flex items-start gap-2.5 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 truncate text-sm font-semibold">
            {provider.name}
            <span className="font-mono text-xs font-normal text-muted-foreground">{provider.id}</span>
          </h2>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            {PROVIDER_KIND_LABELS[provider.kind]} · {ADAPTER_LABELS[provider.adapter]}
            <InfoTip label={PROVIDER_KIND_LABELS[provider.kind]}>{PROVIDER_KIND_DESCRIPTIONS[provider.kind]}</InfoTip>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {provider.status === "active" ? <HealthPill state={health.state} /> : <ProviderStatusPill status={provider.status} />}
          {can.manageProviders && (
            <CardActions
              provider={provider}
              onEdit={() => setEditing(true)}
              onCredential={() => setRotating(true)}
              onPause={() => setPausing(true)}
            />
          )}
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 px-4 py-3">
        <div className="grid grid-cols-3 gap-4">
          <Figure
            label="Success 24h"
            value={health.successRate24h === null ? "—" : percent(health.successRate24h)}
            info="Attempts on this provider's routes that produced output in the last 24 hours."
          />
          <Figure label="p50" value={health.p50Ms === null ? "—" : milliseconds(health.p50Ms)} />
          <Figure label="Requests 24h" value={integer(provider.requests24h)} />
          <Figure label="Cost 30d" value={usdCompact(provider.cost30d)} info="What we paid this provider in the last 30 days." />
          <Figure
            label="Balance"
            value={provider.balance === null ? "—" : usd(provider.balance)}
            info="Prepaid credit at the provider, when its API reports it. Low balances fail requests."
          />
          <Figure label="Incidents 7d" value={integer(health.incidents7d)} />
        </div>
        <div className="grid gap-3 border-t pt-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">Key</span>
            {credential.configured ? (
              <span className="flex min-w-0 items-center gap-2 text-xs">
                <span className="font-mono">{credential.hint}</span>
                <Pill tone={credential.source === "console" ? "info" : "neutral"}>
                  {credential.source === "console" ? "Set in console" : "From environment"}
                </Pill>
              </span>
            ) : (
              <span className="text-xs font-medium text-status-critical">Not set</span>
            )}
          </div>
          {credential.rotatedAt && (
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-muted-foreground">Rotated</span>
              <RelativeTime value={credential.rotatedAt} />
            </div>
          )}
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-muted-foreground">Limits</span>
            <span className="tabular">
              {limits.concurrency === null ? "No concurrency cap" : `${integer(limits.concurrency)} in flight`}
              {" · "}
              {limits.requestsPerMinute === null ? "no RPM cap" : `${integer(limits.requestsPerMinute)}/min`}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-muted-foreground">Endpoint</span>
            <span className="min-w-0 truncate font-mono" title={provider.baseUrl}>
              {provider.baseUrl}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-muted-foreground">Regions</span>
            <span className="uppercase">{provider.regions.join(", ") || "—"}</span>
          </div>
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
          {provider.routes > 0 ? (
            <Link href={`/models?provider=${provider.id}`} className="hover:text-foreground hover:underline">
              {plural(provider.routes, "route")} across {plural(provider.models, "model")}
            </Link>
          ) : (
            <span>
              {provider.kind === "managed" ? "No self-hosted models deployed yet" : "No routes yet"}
            </span>
          )}
          {health.checkedAt && (
            <span>
              Checked <RelativeTime value={health.checkedAt} />
            </span>
          )}
        </div>
      </div>
      <ProviderDialog provider={provider} open={editing} onOpenChange={setEditing} />
      <CredentialDialog provider={provider} open={rotating} onOpenChange={setRotating} />
      <ReasonDialog
        open={pausing}
        onOpenChange={setPausing}
        title={`Pause ${provider.name}?`}
        description={`New attempts skip its ${plural(provider.routes, "route")} at once and fall through to the next route. Versions with no other route fail until you resume it.`}
        label="Reason"
        placeholder="e.g. Elevated 5xx since 14:20 UTC, ticket #4821"
        required
        action="Pause provider"
        destructive
        describeError={errorMessage}
        onSubmit={async (reason) => {
          apply(await pauseProvider(provider.id, reason));
          setPausing(false);
          toast.success(`${provider.name} is paused`);
        }}
      />
    </section>
  );
}

/** Upstream providers: their health, keys, limits and what we spend with them. */
export function ProvidersView() {
  const can = usePermissions();
  const providers = useQuery({ queryKey: keys.providers, queryFn: listProviders });
  const [adding, setAdding] = useState(false);
  const list = providers.data;
  const attention = list?.filter((p) => p.status === "active" && p.health.state !== "operational").length ?? 0;

  return (
    <>
      <PageHeader title="Providers" description="Who serves our models, how healthy they are and what they cost us">
        {can.manageProviders && (
          <Button onClick={() => setAdding(true)}>
            <Plus /> Add provider
          </Button>
        )}
      </PageHeader>
      <PageBody className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Models reach providers through routes on each version. Pausing a provider skips its routes everywhere at once; to stop one
          model, pause its route instead.
          {attention > 0 && <span className="font-medium text-status-warning"> {plural(attention, "provider")} need attention.</span>}
        </p>
        {providers.error && !list ? (
          <ErrorState
            error={providers.error}
            onRetry={() => void providers.refetch()}
            retrying={providers.isFetching}
            className="rounded-lg border bg-card"
          />
        ) : !list ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3" aria-busy="true">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-96 rounded-lg" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState title="No providers" description="Add a provider, then route model versions to it." />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {list.map((provider) => (
              <ProviderCard key={provider.id} provider={provider} />
            ))}
          </div>
        )}
      </PageBody>
      <ProviderDialog provider={null} open={adding} onOpenChange={setAdding} />
    </>
  );
}
