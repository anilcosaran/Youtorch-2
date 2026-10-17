"use client";

import { format, parseISO } from "date-fns";
import { ArrowRight } from "lucide-react";
import { CopyButton } from "@/components/shared/copy-field";
import { DetailSection } from "@/components/shared/detail-section";
import { Pill, type Tone } from "@/components/shared/pill";
import type { Attempt, AttemptStatus, RequestDetail, RequestStatus } from "@/lib/api/requests";
import { milliseconds, plural, utc } from "@/lib/format";
import { REQUEST_STATUS_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { ATTEMPT_STATUS_LABELS, ATTEMPT_VERBS, inFlight } from "./request-format";

const ATTEMPT_TONES: Record<AttemptStatus, Tone> = {
  succeeded: "good",
  failed: "critical",
  timeout: "warning",
  canceled: "neutral",
};

const ATTEMPT_COLORS: Record<AttemptStatus, string> = {
  succeeded: "var(--status-good)",
  failed: "var(--status-critical)",
  timeout: "var(--status-warning)",
  canceled: "var(--muted-foreground)",
};

const ATTEMPT_TEXT: Record<AttemptStatus, string> = {
  succeeded: "text-status-good",
  failed: "text-status-critical",
  timeout: "text-status-warning",
  canceled: "text-muted-foreground",
};

type EventStatus = RequestStatus | "attempt";

const EVENT_COLORS: Record<EventStatus, string> = {
  queued: "var(--muted-foreground)",
  running: "var(--series-1)",
  succeeded: "var(--status-good)",
  failed: "var(--status-critical)",
  canceled: "var(--muted-foreground)",
  attempt: "var(--series-7)",
};

const EVENT_LABELS: Record<EventStatus, string> = { ...REQUEST_STATUS_LABELS, attempt: "Attempt" };

/** "14:03:07" in the viewer's time zone; request events are seconds apart. */
const clock = (value: string) => format(parseISO(value), "HH:mm:ss");

/** Time since the request was accepted: "+1.4 s". */
const offset = (from: string, at: string) => `+${milliseconds(Math.max(0, Date.parse(at) - Date.parse(from)))}`;

/** A dot on a vertical rail, with the line on to the next item unless it is the last. */
function Rail({ color, last }: { color: string; last: boolean }) {
  return (
    <>
      <span
        aria-hidden
        className="absolute top-1.5 left-[3px] size-2.5 rounded-full ring-4 ring-card"
        style={{ background: color }}
      />
      {!last && <span aria-hidden className="absolute top-5 -bottom-1 left-[7.5px] w-px bg-border" />}
    </>
  );
}

/** "then", between the steps of a story. */
function Then() {
  return (
    <>
      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="sr-only">then</span>
    </>
  );
}

/**
 * The fallback story in one line: "Attempt 1 on fal failed: upstream_timeout
 * → Attempt 2 on replicate succeeded".
 */
function FallbackStory({
  attempts,
  running,
  providerName,
}: {
  attempts: Attempt[];
  running: boolean;
  providerName: (id: string) => string;
}) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-muted/50 px-3 py-2 text-sm">
      {attempts.map((attempt, i) => (
        <span key={attempt.number} className="inline-flex min-w-0 items-center gap-2">
          {i > 0 && <Then />}
          <span className="min-w-0">
            Attempt {attempt.number} on <span className="font-medium">{providerName(attempt.provider)}</span>{" "}
            <span className={cn("font-medium", ATTEMPT_TEXT[attempt.status])}>{ATTEMPT_VERBS[attempt.status]}</span>
            {attempt.error && attempt.status !== "succeeded" && (
              <span className="text-muted-foreground">: {attempt.error}</span>
            )}
          </span>
        </span>
      ))}
      {running && (
        <span className="inline-flex items-center gap-2 text-muted-foreground">
          <Then />
          Still running
        </span>
      )}
    </p>
  );
}

function AttemptItem({
  attempt,
  startedFrom,
  last,
  providerName,
}: {
  attempt: Attempt;
  startedFrom: string;
  last: boolean;
  providerName: (id: string) => string;
}) {
  return (
    <li className="relative pb-4 pl-7 last:pb-0">
      <Rail color={ATTEMPT_COLORS[attempt.status]} last={last} />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-medium">Attempt {attempt.number}</span>
        <span className="text-sm text-muted-foreground">on {providerName(attempt.provider)}</span>
        <Pill tone={ATTEMPT_TONES[attempt.status]}>{ATTEMPT_STATUS_LABELS[attempt.status]}</Pill>
        {attempt.latencyMs !== null && (
          <span className="ml-auto text-xs text-muted-foreground tabular">{milliseconds(attempt.latencyMs)}</span>
        )}
      </div>
      <dl className="mt-2 grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Upstream model</dt>
        <dd className="truncate font-mono" title={attempt.upstreamModel}>
          {attempt.upstreamModel}
        </dd>
        <dt className="text-muted-foreground">Upstream ID</dt>
        <dd className="flex min-w-0 items-center gap-1">
          {attempt.upstreamId ? (
            <>
              <span className="truncate font-mono" title={attempt.upstreamId}>
                {attempt.upstreamId}
              </span>
              <CopyButton value={attempt.upstreamId} label="Upstream ID" className="-my-1 size-5" />
            </>
          ) : (
            <span className="text-muted-foreground">None</span>
          )}
        </dd>
        <dt className="text-muted-foreground">Started</dt>
        <dd>
          <time dateTime={attempt.startedAt} title={utc(attempt.startedAt)} className="tabular">
            {clock(attempt.startedAt)}
          </time>
          <span className="ml-1.5 text-muted-foreground tabular">{offset(startedFrom, attempt.startedAt)}</span>
        </dd>
      </dl>
      {attempt.error && (
        <p className="mt-2 rounded-md bg-muted/50 px-2.5 py-1.5 font-mono text-xs break-words text-status-critical">
          {attempt.error}
        </p>
      )}
    </li>
  );
}

/** Every route the router tried, in order, so a fallback reads at a glance. */
export function AttemptsSection({
  request,
  providerName,
}: {
  request: RequestDetail;
  providerName: (id: string) => string;
}) {
  const attempts = [...request.attemptList].sort((a, b) => a.number - b.number);
  return (
    <DetailSection
      title="Attempts"
      action={<span className="text-xs text-muted-foreground">{plural(attempts.length, "attempt")}</span>}
    >
      {attempts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {inFlight(request.status)
            ? "No provider has picked it up yet."
            : "No provider was tried: the request ended before routing."}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {attempts.length > 1 && (
            <FallbackStory attempts={attempts} running={inFlight(request.status)} providerName={providerName} />
          )}
          <ol aria-label="Attempts">
            {attempts.map((attempt, i) => (
              <AttemptItem
                key={attempt.number}
                attempt={attempt}
                startedFrom={request.createdAt}
                last={i === attempts.length - 1}
                providerName={providerName}
              />
            ))}
          </ol>
        </div>
      )}
    </DetailSection>
  );
}

/** What happened to the request, second by second. */
export function EventsSection({ request }: { request: RequestDetail }) {
  const events = [...request.events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return (
    <DetailSection title="Events">
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing has happened yet.</p>
      ) : (
        <ol aria-label="Events">
          {events.map((event, i) => (
            <li key={`${event.at}-${i}`} className="relative pb-3 pl-7 last:pb-0">
              <Rail color={EVENT_COLORS[event.status]} last={i === events.length - 1} />
              <div className="flex items-baseline gap-3 text-sm">
                <time dateTime={event.at} title={utc(event.at)} className="shrink-0 text-xs text-muted-foreground tabular">
                  {clock(event.at)}
                </time>
                <span className="w-20 shrink-0 text-xs font-medium">{EVENT_LABELS[event.status]}</span>
                <span className="min-w-0 flex-1 break-words">{event.detail}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular">
                  {offset(request.createdAt, event.at)}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </DetailSection>
  );
}
