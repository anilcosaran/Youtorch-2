import type { BillingUnit } from "@modelvend/admin-api/models";
import type { AttemptStatus, TaskDetail, TaskStatus } from "@modelvend/admin-api/tasks";
import { compact, usdPrecise } from "@/lib/format";

/** Still waiting for a result, so its status and numbers will change. */
export const inFlight = (status: TaskStatus) => status === "queued" || status === "running";

/** What the customer paid minus what the provider charged us. */
export const marginOf = (task: { amountMicros: number; costMicros: number }) => task.amountMicros - task.costMicros;

/** What a task paid, cost or kept, in micro-dollars. Under a dollar, fractions of a cent stay visible: "$0.0035". */
export const money = usdPrecise;

const unitsFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** What a task was billed for: "5 s", "2 images", "1.2 MP", "3.4K tokens"; "—" until it is known. */
export function unitsText(units: number | null, unit: BillingUnit | null): string {
  if (units === null || unit === null) return "—";
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
      return `${n} ${one ? "task" : "tasks"}`;
    case "mesh":
      return `${n} ${one ? "mesh" : "meshes"}`;
    case "1k_chars":
      return `${compact(Math.round(units * 1000))} chars`;
    case "1m_tokens":
      return `${compact(Math.round(units * 1_000_000))} tokens`;
  }
}

export const ATTEMPT_STATUS_LABELS: Record<AttemptStatus, string> = {
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  timeout: "Timed out",
  canceled: "Canceled",
};

/** How an attempt went, inside a sentence: "Attempt 1 on kling timed out". */
export const ATTEMPT_VERBS: Record<AttemptStatus, string> = {
  running: "is running",
  succeeded: "succeeded",
  failed: "failed",
  timeout: "timed out",
  canceled: "was canceled",
};

const FINISHED = new Set<string>(["succeeded", "failed", "canceled"]);

/** When the task finished: its last final event, else its start plus its latency. */
export function finishedAt(task: TaskDetail): string | null {
  const event = task.events.findLast((e) => FINISHED.has(e.status));
  if (event) return event.at;
  if (inFlight(task.status) || task.latencyMs === null) return null;
  return new Date(Date.parse(task.createdAt) + task.latencyMs).toISOString();
}

export interface OutputLink {
  /** Where the URL sits in the output, e.g. `images[0].url`. */
  path: string;
  url: string;
}

const MAX_LINKS = 50;

/** What a task ran: `google/veo-3.1@v2`, or the app for an app run. */
export function subjectOf(task: Pick<TaskDetail, "model" | "version" | "app">): string {
  if (task.model) return task.version ? `${task.model}@${task.version}` : task.model;
  return task.app ? `App ${task.app}` : "Unknown";
}

/** Every web URL in a task's output (media is stored and handed back as URLs), each once. */
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
