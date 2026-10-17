"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CircleAlert, ExternalLink, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError, errorMessage } from "@modelvend/admin-api/client";
import { getRequest, refundRequest, type RequestDetail } from "@modelvend/admin-api/requests";
import { EmptyState, ErrorState } from "@/components/data/states";
import { AccessLink } from "@/components/shared/access-link";
import { CopyButton } from "@/components/shared/copy-field";
import { DetailSection } from "@/components/shared/detail-section";
import { JsonView } from "@/components/shared/json-view";
import { Pill } from "@/components/shared/pill";
import { ReasonDialog } from "@/components/shared/reason-dialog";
import { listStepping, SidePanel } from "@/components/shared/side-panel";
import { RequestStatusPill } from "@/components/shared/status";
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
import { finishedAt, inFlight, marginOf, money, outputLinks, unitsText } from "./request-format";
import { AttemptsSection, EventsSection } from "./request-timeline";
import { useProviders } from "./use-providers";

/** How often an open request that is still queued or running refreshes. */
const LIVE_INTERVAL = 5_000;

const requestQuery = (id: string) => ({
  queryKey: keys.request(id),
  queryFn: () => getRequest(id),
});

const MODE_TEXT: Record<RequestDetail["mode"], { label: string; title: string }> = {
  sync: { label: "Sync", title: "The caller held the connection open for the result" },
  queue: { label: "Queue", title: "The caller polls for the result or gets a webhook" },
};

const linkClass = "outline-none hover:underline focus-visible:underline";

/** A request a customer paid for and that finished can be refunded, once. */
const refundable = (request: RequestDetail) =>
  (request.status === "succeeded" || request.status === "failed") && request.price > 0 && !request.refundedAt;

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
function Summary({ request }: { request: RequestDetail }) {
  const pending = inFlight(request.status);
  const margin = marginOf(request);
  const perUnit = request.units > 0 && request.price > 0 ? request.price / request.units : null;
  return (
    <section aria-label="Summary" className="rounded-lg border bg-card p-4">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
        <Fact label="Price">{pending ? none : <span className="tabular">{money(request.price)}</span>}</Fact>
        <Fact label="Upstream cost">{pending ? none : <span className="tabular">{money(request.cost)}</span>}</Fact>
        <Fact label="Margin">
          {pending ? (
            none
          ) : (
            <span className={cn("tabular", margin < 0 && "font-medium text-status-critical")}>{money(margin)}</span>
          )}
        </Fact>
        <Fact label="Units">
          {pending && request.units === 0 ? (
            none
          ) : (
            <span className="tabular">
              {unitsText(request.units, request.unit)}
              {perUnit !== null && (
                <span className="text-muted-foreground">
                  {" "}
                  × {unitPrice(perUnit)}
                  {UNIT_SHORT[request.unit]}
                </span>
              )}
            </span>
          )}
        </Fact>
        <Fact label="Latency">
          {request.latencyMs === null ? none : <span className="tabular">{milliseconds(request.latencyMs)}</span>}
        </Fact>
        <Fact label="Attempts">
          <span className="tabular">{plural(request.attempts, "attempt")}</span>
        </Fact>
        <Fact label="API key">
          <AccessLink
            permission="keys.view"
            href={`/api-keys?query=${encodeURIComponent(request.keyPrefix)}`}
            className={cn("font-mono text-xs", linkClass)}
            plainClassName="font-mono text-xs"
          >
            {request.keyPrefix}
          </AccessLink>
        </Fact>
        <Fact label="Created">
          <DateTime value={request.createdAt} />
        </Fact>
        <Fact label="Finished">
          <DateTime value={finishedAt(request)} empty={pending ? "Not yet" : "—"} />
        </Fact>
        {request.app && (
          <Fact label="App">
            <AccessLink permission="catalog.view" href={`/apps/${request.app}`} className={linkClass}>
              {request.app}
            </AccessLink>
          </Fact>
        )}
        <Fact label="Webhook" className="col-span-2 sm:col-span-3">
          {request.webhookUrl ? (
            <span className="font-mono text-xs" title={request.webhookUrl}>
              {request.webhookUrl}
            </span>
          ) : (
            <span className="text-muted-foreground">None</span>
          )}
        </Fact>
      </dl>
    </section>
  );
}

/** Why the request failed, as the caller was told. */
function ErrorBox({ request }: { request: RequestDetail }) {
  return (
    <section
      role="alert"
      aria-label="Error"
      className="flex items-start gap-3 rounded-lg border border-[color-mix(in_oklch,var(--status-critical)_40%,transparent)] bg-[color-mix(in_oklch,var(--status-critical)_8%,transparent)] px-4 py-3"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-status-critical" aria-hidden />
      <div className="min-w-0">
        {request.errorCode && <p className="font-mono text-xs font-semibold">{request.errorCode}</p>}
        <p className="mt-0.5 text-sm break-words">
          {request.errorMessage ?? "The request failed without a message."}
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

function Output({ request }: { request: RequestDetail }) {
  const links = request.output ? outputLinks(request.output) : [];
  let empty = "No output.";
  if (inFlight(request.status)) empty = "No output yet: the request is still running.";
  else if (request.status === "failed") empty = "No output: the request failed.";
  else if (request.status === "canceled") empty = "No output: the request was canceled.";
  return (
    <DetailSection
      title="Output"
      action={
        request.output && <CopyButton value={JSON.stringify(request.output, null, 2)} label="Output JSON" />
      }
    >
      {request.output ? (
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
          <JsonView value={request.output} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </DetailSection>
  );
}

function RequestBody({ request, providerName }: { request: RequestDetail; providerName: (id: string) => string }) {
  return (
    <>
      <Summary request={request} />
      {request.status === "failed" && <ErrorBox request={request} />}
      <AttemptsSection request={request} providerName={providerName} />
      <DetailSection
        title="Input"
        action={<CopyButton value={JSON.stringify(request.input, null, 2)} label="Input JSON" />}
      >
        <JsonView value={request.input} />
      </DetailSection>
      <Output request={request} />
      <EventsSection request={request} />
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
  price: number;
  customer: string;
}

/**
 * A request in the side panel (`?panel=request:<id>`), opened from any page:
 * what it cost, every attempt the router made, its input, output and events.
 * On a list of requests J/K move through `ids`.
 */
export function RequestPanel({
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
  const request = useQuery({
    ...requestQuery(openId),
    // Follow a request that is still running until it finishes.
    refetchInterval: (q) => (q.state.data && inFlight(q.state.data.status) ? LIVE_INTERVAL : false),
  });
  // About one request; moving to another forgets it.
  const [refunding, setRefunding] = useState<Refunding | null>(null);

  const previous = stepFrom(ids, openId, -1);
  const next = stepFrom(ids, openId, 1);

  // The neighbours load ahead, so moving through the list is instant.
  useEffect(() => {
    for (const id of [previous, next]) if (id) void queryClient.prefetchQuery(requestQuery(id));
  }, [previous, next, queryClient]);

  const data = request.data?.id === openId ? request.data : undefined;
  const notFound = request.error instanceof ApiError && request.error.status === 404;

  const refund = async ({ id, price, customer }: Refunding, reason: string) => {
    const updated = await refundRequest(id, reason);
    queryClient.setQueryData(keys.request(id), updated);
    void queryClient.invalidateQueries({ queryKey: [...keys.requests, "list"] });
    // The refund lands in the customer's ledger and comes off revenue.
    void queryClient.invalidateQueries({ queryKey: keys.customers });
    void queryClient.invalidateQueries({ queryKey: keys.overviewAll });
    setRefunding(null);
    toast.success("Refunded", { description: `${money(price)} went back to ${customer}.` });
  };

  let body: React.ReactNode;
  if (notFound) {
    body = (
      <EmptyState
        className="rounded-lg border bg-card"
        title="This request doesn't exist"
        description="The link may be old, or the ID was mistyped."
      />
    );
  } else if (request.error && !data) {
    body = (
      <ErrorState
        error={request.error}
        onRetry={() => void request.refetch()}
        retrying={request.isFetching}
        className="rounded-lg border bg-card"
      />
    );
  } else if (!data) {
    body = <PanelSkeleton />;
  } else {
    body = <RequestBody request={data} providerName={nameOf} />;
  }

  const actions = (
    <>
      <CopyButton value={openId} label="Request ID" />
      {data && can.viewCustomers && (
        <Button variant="outline" size="xs" asChild>
          <Link href={`/customers/${data.customer.id}`}>Open customer</Link>
        </Button>
      )}
      {data && can.viewCatalog && (
        <Button variant="outline" size="xs" asChild>
          <Link href={modelHref(data.model, data.version)}>Open model</Link>
        </Button>
      )}
      {data && can.grantCredits && refundable(data) && (
        <Button
          variant="outline"
          size="xs"
          onClick={() => setRefunding({ id: data.id, price: data.price, customer: data.customer.name })}
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
        description={data ? `${data.model}@${data.version} · ${data.customer.name}` : undefined}
        meta={
          data && (
            <>
              <RequestStatusPill status={data.status} />
              <Pill title={MODE_TEXT[data.mode].title}>{MODE_TEXT[data.mode].label}</Pill>
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
        title="Refund this request"
        description={
          pending
            ? `${money(pending.price)} goes back to ${pending.customer}'s balance and shows in their ledger as a refund.`
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
