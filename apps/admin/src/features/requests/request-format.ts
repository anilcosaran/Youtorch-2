import type { BillingUnit } from "@/lib/api/models";
import type { AttemptStatus, RequestDetail, RequestStatus } from "@/lib/api/requests";
import { compact, unitPrice, usd } from "@/lib/format";

/** Still waiting for a result, so its status and numbers will change. */
export const inFlight = (status: RequestStatus) => status === "queued" || status === "running";

/** What the customer paid minus what the provider charged us. */
export const marginOf = (request: { price: number; cost: number }) => request.price - request.cost;

/** A request's price, cost or margin. Under a dollar, fractions of a cent stay visible: "$0.0035". */
export const money = (dollars: number) => (Math.abs(dollars) < 1 ? unitPrice(dollars) : usd(dollars));

const unitsFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** What a request was billed for: "5 s", "2 images", "1.2 MP", "3.4K tokens". */
export function unitsText(units: number, unit: BillingUnit): string {
  const n = unitsFormatter.format(units);
  const one = units === 1;
  switch (unit) {
    case "second":
      return `${n} s`;
    case "minute":
      return `${n} min`;
    case "megapixel":
      return `${n} MP`;
    case "image":
      return `${n} ${one ? "image" : "images"}`;
    case "request":
      return `${n} ${one ? "request" : "requests"}`;
    case "mesh":
      return `${n} ${one ? "mesh" : "meshes"}`;
    case "1k_chars":
      return `${compact(Math.round(units * 1000))} chars`;
    case "1m_tokens":
      return `${compact(Math.round(units * 1_000_000))} tokens`;
  }
}

export const ATTEMPT_STATUS_LABELS: Record<AttemptStatus, string> = {
  succeeded: "Succeeded",
  failed: "Failed",
  timeout: "Timed out",
  canceled: "Canceled",
};

/** How an attempt ended, inside a sentence: "Attempt 1 on fal timed out". */
export const ATTEMPT_VERBS: Record<AttemptStatus, string> = {
  succeeded: "succeeded",
  failed: "failed",
  timeout: "timed out",
  canceled: "was canceled",
};

const FINISHED = new Set<string>(["succeeded", "failed", "canceled"]);

/** When the request finished: its last final event, else its start plus its latency. */
export function finishedAt(request: RequestDetail): string | null {
  const event = request.events.findLast((e) => FINISHED.has(e.status));
  if (event) return event.at;
  if (inFlight(request.status) || request.latencyMs === null) return null;
  return new Date(Date.parse(request.createdAt) + request.latencyMs).toISOString();
}

export interface OutputLink {
  /** Where the URL sits in the output, e.g. `images[0].url`. */
  path: string;
  url: string;
}

const MAX_LINKS = 50;

/** Every web URL in a request's output (media is stored and handed back as URLs), each once. */
export function outputLinks(output: unknown): OutputLink[] {
  const found = new Map<string, OutputLink>();
  const visit = (value: unknown, path: string) => {
    if (found.size >= MAX_LINKS) return;
    if (typeof value === "string") {
      if (/^https?:\/\//i.test(value) && !found.has(value)) found.set(value, { path: path || "output", url: value });
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => visit(item, `${path}[${i}]`));
    } else if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) visit(item, path ? `${path}.${key}` : key);
    }
  };
  visit(output, "");
  return [...found.values()];
}
