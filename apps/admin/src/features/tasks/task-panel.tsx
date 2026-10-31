"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CircleAlert, ExternalLink, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError, errorMessage } from "@modelvend/admin-api/client";
import { toDollars } from "@modelvend/admin-api/money";
import { getTask, refundTask, type TaskDetail } from "@modelvend/admin-api/tasks";
import { EmptyState, ErrorState } from "@/components/data/states";
import { AccessLink } from "@/components/shared/access-link";
import { CopyButton } from "@/components/shared/copy-field";
import { DetailSection } from "@/components/shared/detail-section";
import { JsonView } from "@/components/shared/json-view";
import { PanelLink } from "@/components/shared/panel-link";
import { Pill } from "@/components/shared/pill";
import { ReasonDialog } from "@/components/shared/reason-dialog";
import { listStepping, SidePanel } from "@/components/shared/side-panel";
import { TaskStatusPill } from "@/components/shared/status";
import { DateTime } from "@/components/shared/time";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { modelHref } from "@/lib/catalog";
import { milliseconds, plural, unitPrice } from "@/lib/format";
import { UNIT_SHORT } from "@/lib/labels";
import { stepFrom } from "@/lib/panel";
import { keys } from "@/lib/query-keys";
import { usePermissions } from "@/lib/session";
import { cn } from "@/lib/utils";
import { finishedAt, inFlight, marginOf, money, outputLinks, subjectOf, unitsText } from "./task-format";
import { AttemptsSection, EventsSection } from "./task-timeline";
import { useProviders } from "./use-providers";

/** How often an open task that is still queued or running refreshes. */
const LIVE_INTERVAL = 5_000;

const taskQuery = (id: string) => ({
  queryKey: keys.task(id),
  queryFn: () => getTask(id),
});

const linkClass = "outline-none hover:underline focus-visible:underline";

/**
 * A task the customer paid for can be refunded, once. Only succeeded tasks are charged: failed and canceled
 * ones cost the customer nothing, so there is nothing to give back.
 */
const refundable = (task: TaskDetail) => task.status === "succeeded" && task.amountMicros > 0 && !task.refundedAt;

function Fact({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate">{children}</dd>
    </div>
  );
}

const none = <span className="text-muted-foreground">—</span>;

/** Money, units and timing at a glance. */
function Summary({ task }: { task: TaskDetail }) {
  const pending = inFlight(task.status);
  const margin = marginOf(task);
  const perUnit = task.units !== null && task.units > 0 && task.amountMicros > 0 ? toDollars(task.amountMicros) / task.units : null;
  return (
    <section aria-label="Summary" className="rounded-lg border bg-card p-4">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
        <Fact label="Paid">
          {pending ? (
            none
          ) : task.amountMicros === 0 && (task.status === "failed" || task.status === "canceled") ? (
            <span className="text-muted-foreground" title="Only succeeded tasks are billed">
              Not charged
            </span>
          ) : (
            <span className="tabular">{money(task.amountMicros)}</span>
          )}
        </Fact>
        <Fact label="Provider cost">{pending ? none : <span className="tabular">{money(task.costMicros)}</span>}</Fact>
        <Fact label="Margin">
          {pending ? (
            none
          ) : (
            <span className={cn("tabular", margin < 0 && "font-medium text-status-critical")}>{money(margin)}</span>
          )}
        </Fact>
        {pending && (
          <Fact label="Held">
            <span className="tabular" title="Held from the customer's balance until the task finishes">
              {money(task.holdMicros)}
            </span>
          </Fact>
        )}
        <Fact label="Units">
          {task.units === null ? (
            none
          ) : (
            <span className="tabular">
              {unitsText(task.units, task.unit)}
              {perUnit !== null && (
                <span className="text-muted-foreground">
                  {" "}
                  × {unitPrice(perUnit)}
                  {task.unit && UNIT_SHORT[task.unit]}
                </span>
              )}
            </span>
          )}
        </Fact>
        <Fact label="Latency">
          {task.latencyMs === null ? none : <span className="tabular">{milliseconds(task.latencyMs)}</span>}
        </Fact>
        {task.steps.length === 0 && (
          <Fact label="Attempts">
            <span className="tabular">{plural(task.attempts, "attempt")}</span>
          </Fact>
        )}
        <Fact label="API key">
          {task.keyPrefix ? (
            <AccessLink
              permission="keys.view"
              href={`/api-keys?query=${encodeURIComponent(task.keyPrefix)}`}
              className={cn("font-mono text-xs", linkClass)}
              plainClassName="font-mono text-xs"
            >
              {task.keyPrefix}
            </AccessLink>
          ) : (
            <span className="text-muted-foreground" title="Made in the console's playground">
              Playground
            </span>
          )}
        </Fact>
        <Fact label="Created">
          <DateTime value={task.createdAt} />
        </Fact>
        <Fact label="Finished">
          <DateTime value={finishedAt(task)} empty={pending ? "Not yet" : "—"} />
        </Fact>
        {task.app && (
          <Fact label="App">
            <AccessLink permission="catalog.view" href={`/apps/${task.app}`} className={linkClass}>
              {task.app}
            </AccessLink>
          </Fact>
        )}
        {task.stage && <Fact label="Stage">{task.stage}</Fact>}
        {task.parentId && (
          <Fact label="App run">
            <PanelLink to={{ kind: "task", id: task.parentId }} className={cn("font-mono text-xs", linkClass)} plainClassName="font-mono text-xs">
              {task.parentId}
            </PanelLink>
          </Fact>
        )}
        <Fact label="Webhook" className="col-span-2 sm:col-span-3">
          {task.webhookUrl ? (
            <span className="font-mono text-xs" title={task.webhookUrl}>
              {task.webhookUrl}
            </span>
          ) : (
            <span className="text-muted-foreground">None</span>
          )}
        </Fact>
      </dl>
    </section>
  );
}

/** Why the task failed, as the caller was told. */
function ErrorBox({ task }: { task: TaskDetail }) {
  return (
    <section
      role="alert"
      aria-label="Error"
      className="flex items-start gap-3 rounded-lg border border-[color-mix(in_oklch,var(--status-critical)_40%,transparent)] bg-[color-mix(in_oklch,var(--status-critical)_8%,transparent)] px-4 py-3"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-status-critical" aria-hidden />
      <div className="min-w-0">
        {task.errorCode && <p className="font-mono text-xs font-semibold">{task.errorCode}</p>}
        <p className="mt-0.5 text-sm break-words">
          {task.errorMessage ?? "The task failed without a message."}
        </p>
      </div>
    </section>
  );
}

/** The last segment of a URL's path, which is usually the file name. */
function fileName(url: string): string {
  try {
    const { pathname, host } = new URL(url);
    const last = pathname.split("/").filter(Boolean).at(-1);
    return last ? decodeURIComponent(last) : host;
  } catch {
    return url;
  }
}

function Output({ task }: { task: TaskDetail }) {
  const links = task.output ? outputLinks(task.output) : [];
  let empty = "No output.";
  if (inFlight(task.status)) empty = "No output yet: the task is still running.";
  else if (task.status === "failed") empty = "No output: the task failed.";
  else if (task.status === "canceled") empty = "No output: the task was canceled.";
  return (
    <DetailSection
      title="Output"
      action={
        task.output && <CopyButton value={JSON.stringify(task.output, null, 2)} label="Output JSON" />
      }
    >
      {task.output ? (
        <div className="flex flex-col gap-3">
          {links.length > 0 && (
            <ul aria-label="Files" className="flex flex-col gap-1">
              {links.map((link) => (
                <li key={link.url} className="flex min-w-0 items-center gap-2 text-sm">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    title={link.url}
                    className={cn("inline-flex min-w-0 items-center gap-1 font-medium", linkClass)}
                  >
                    <span className="truncate">{fileName(link.url)}</span>
                    <ExternalLink className="size-3 shrink-0" aria-hidden />
                  </a>
                  <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">{link.path}</span>
                </li>
              ))}
            </ul>
          )}
          <JsonView value={task.output} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </DetailSection>
  );
}

/** What an app run ran, each step opening in this panel. */
function Steps({ task, providerName }: { task: TaskDetail; providerName: (id: string) => string }) {
  return (
    <DetailSection
      title="Steps"
      action={<span className="text-xs text-muted-foreground">{plural(task.steps.length, "step")}</span>}
      bodyClassName="p-0"
    >
      <ol aria-label="Steps">
        {task.steps.map((step) => (
          <li key={step.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2.5 text-sm last:border-b-0">
            <PanelLink to={{ kind: "task", id: step.id }} className={cn("font-mono text-xs", linkClass)} plainClassName="font-mono text-xs">
              {step.id}
            </PanelLink>
            <TaskStatusPill status={step.status} />
            <span className="min-w-0 truncate text-xs text-muted-foreground" title={subjectOf(step)}>
              {step.stage && `${step.stage} · `}
              {subjectOf(step)}
              {step.provider && ` · ${providerName(step.provider)}`}
            </span>
            <span className="ml-auto text-xs whitespace-nowrap text-muted-foreground tabular">
              {step.latencyMs !== null && `${milliseconds(step.latencyMs)} · `}cost {money(step.costMicros)}
            </span>
          </li>
        ))}
      </ol>
    </DetailSection>
  );
}

function TaskBody({ task, providerName }: { task: TaskDetail; providerName: (id: string) => string }) {
  return (
    <>
      <Summary task={task} />
      {task.status === "failed" && <ErrorBox task={task} />}
      {task.steps.length > 0 && <Steps task={task} providerName={providerName} />}
      {task.steps.length === 0 && <AttemptsSection task={task} providerName={providerName} />}
      <DetailSection
        title="Input"
        action={<CopyButton value={JSON.stringify(task.input, null, 2)} label="Input JSON" />}
      >
        <JsonView value={task.input} />
      </DetailSection>
      <Output task={task} />
      {Object.keys(task.metadata).length > 0 && (
        <DetailSection
          title="Metadata"
          action={<CopyButton value={JSON.stringify(task.metadata, null, 2)} label="Metadata JSON" />}
        >
          <JsonView value={task.metadata} />
        </DetailSection>
      )}
      <EventsSection task={task} />
    </>
  );
}

function PanelSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-44 rounded-lg" />
      <Skeleton className="h-48 rounded-lg" />
      <Skeleton className="h-40 rounded-lg" />
      <Skeleton className="h-32 rounded-lg" />
    </div>
  );
}

interface Refunding {
  id: string;
  amountMicros: number;
  customer: string;
}

/**
 * A task in the side panel (`?panel=task:<id>`), opened from any page:
 * what it cost, every attempt the router made, its input, output and events.
 * On a list of tasks J/K move through `ids`.
 */
export function TaskPanel({
  openId,
  ids,
  onOpen,
}: {
  openId: string;
  ids: string[];
  onOpen: (id: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const can = usePermissions();
  const { nameOf } = useProviders();
  const task = useQuery({
    ...taskQuery(openId),
    // Follow a task that is still running until it finishes.
    refetchInterval: (q) => (q.state.data && inFlight(q.state.data.status) ? LIVE_INTERVAL : false),
  });
  // About one task; moving to another forgets it.
  const [refunding, setRefunding] = useState<Refunding | null>(null);

  const previous = stepFrom(ids, openId, -1);
  const next = stepFrom(ids, openId, 1);

  // The neighbours load ahead, so moving through the list is instant.
  useEffect(() => {
    for (const id of [previous, next]) if (id) void queryClient.prefetchQuery(taskQuery(id));
  }, [previous, next, queryClient]);

  const data = task.data?.id === openId ? task.data : undefined;
  const notFound = task.error instanceof ApiError && task.error.status === 404;

  const refund = async ({ id, amountMicros, customer }: Refunding, reason: string) => {
    let updated: TaskDetail;
    try {
      updated = await refundTask(id, reason);
    } catch (error) {
      void queryClient.invalidateQueries({ queryKey: keys.task(id) });
      throw error;
    }
    queryClient.setQueryData(keys.task(id), updated);
    void queryClient.invalidateQueries({ queryKey: [...keys.tasks, "list"] });
    // The refund lands in the customer's ledger and the audit log, and comes off revenue.
    void queryClient.invalidateQueries({ queryKey: keys.customers });
    void queryClient.invalidateQueries({ queryKey: keys.overviewAll });
    void queryClient.invalidateQueries({ queryKey: keys.audit });
    setRefunding(null);
    toast.success("Refunded", { description: `${money(amountMicros)} went back to ${customer}.` });
  };

  let body: React.ReactNode;
  if (notFound) {
    body = (
      <EmptyState
        className="rounded-lg border bg-card"
        title="This task doesn't exist"
        description="The link may be old, or the ID was mistyped."
      />
    );
  } else if (task.error && !data) {
    body = (
      <ErrorState
        error={task.error}
        onRetry={() => void task.refetch()}
        retrying={task.isFetching}
        className="rounded-lg border bg-card"
      />
    );
  } else if (!data) {
    body = <PanelSkeleton />;
  } else {
    body = <TaskBody task={data} providerName={nameOf} />;
  }

  const actions = (
    <>
      <CopyButton value={openId} label="Task ID" />
      {data && can.viewCustomers && (
        <Button variant="outline" size="xs" asChild>
          <Link href={`/customers/${data.customer.id}`}>Open customer</Link>
        </Button>
      )}
      {data?.model && can.viewCatalog && (
        <Button variant="outline" size="xs" asChild>
          <Link href={modelHref(data.model, data.version ?? undefined)}>Open model</Link>
        </Button>
      )}
      {data?.app && can.viewCatalog && (
        <Button variant="outline" size="xs" asChild>
          <Link href={`/apps/${data.app}`}>Open app</Link>
        </Button>
      )}
      {data && can.grantCredits && refundable(data) && (
        <Button
          variant="outline"
          size="xs"
          onClick={() => setRefunding({ id: data.id, amountMicros: data.amountMicros, customer: data.customer.name })}
        >
          <Undo2 /> Refund
        </Button>
      )}
    </>
  );

  const pending = refunding && refunding.id === openId ? refunding : null;

  return (
    <>
      <SidePanel
        title={<span className="font-mono">{openId}</span>}
        description={data ? `${subjectOf(data)} · ${data.customer.name}` : undefined}
        meta={
          data && (
            <>
              <TaskStatusPill status={data.status} />
              {data.provider && <Pill title="The provider that finished it">{nameOf(data.provider)}</Pill>}
              {data.refundedAt && (
                <Pill tone="warning" title={`Refunded ${data.refundedAt}`}>
                  Refunded
                </Pill>
              )}
            </>
          )
        }
        actions={actions}
        {...listStepping(ids, openId, onOpen)}
      >
        {body}
      </SidePanel>
      <ReasonDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setRefunding(null)}
        title="Refund this task"
        description={
          pending
            ? `${money(pending.amountMicros)} goes back to the credit it came from in ${pending.customer}'s balance, and shows in their ledger as a refund.`
            : undefined
        }
        label="Reason"
        placeholder="Why the customer gets this back, for the audit log"
        required
        action="Refund"
        onSubmit={(reason) => (pending ? refund(pending, reason) : Promise.resolve())}
        describeError={errorMessage}
      />
    </>
  );
}
