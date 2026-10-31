import type { LimitName } from "@modelvend/admin-api/customers";
import { toDollars, toMicros } from "@modelvend/admin-api/money";
import { integer, span, usd } from "@/lib/format";
import { parseCount, parseDollars } from "./money";

export const LIMIT_LABELS: Record<LimitName, string> = {
  requestsPerMinute: "Requests per minute",
  concurrency: "Tasks running at once",
  queueSize: "Tasks waiting at once",
  queueWaitSeconds: "Longest queue wait",
  dailySpendMicros: "Daily spend limit",
  monthlySpendMicros: "Monthly spend limit",
  subAccounts: "Sub-accounts",
  topUpMinMicros: "Smallest top-up",
  topUpMaxMicros: "Largest top-up",
  firstWeekDailyTopUpMicros: "Daily top-ups, first 7 days",
};

export const LIMIT_DESCRIPTIONS: Record<LimitName, string> = {
  requestsPerMinute: "Across every key of the workspace; calls above it are refused until the minute passes.",
  concurrency: "How many of the workspace's tasks may run at the same time. Beyond it they wait in the queue.",
  queueSize: "How many of its tasks may wait in the queue. Beyond it the API answers 429 queue_full.",
  queueWaitSeconds: "How long a task may wait in the queue. Beyond it the task fails with queue_timeout, free of charge.",
  dailySpendMicros: "Beyond it the API answers 402 daily_spend_limit_reached. Resets at 00:00 UTC.",
  monthlySpendMicros: "Beyond it the API answers 402.",
  subAccounts: "How many sub-accounts the workspace may have.",
  topUpMinMicros: "The smallest single top-up.",
  topUpMaxMicros: "The largest single top-up.",
  firstWeekDailyTopUpMicros: "Top-ups per day during the workspace's first 7 days, the main guard against stolen cards.",
};

/** The limits entered in dollars and sent as micro-dollars. */
const MONEY_LIMITS: ReadonlySet<LimitName> = new Set<LimitName>([
  "dailySpendMicros",
  "monthlySpendMicros",
  "topUpMinMicros",
  "topUpMaxMicros",
  "firstWeekDailyTopUpMicros",
]);

export const isMoneyLimit = (name: LimitName) => MONEY_LIMITS.has(name);

/** What `LimitOverrides` allows for the limits that are counts. Money limits only need to be above zero. */
export const LIMIT_BOUNDS: Partial<Record<LimitName, { min: number; max: number }>> = {
  requestsPerMinute: { min: 1, max: 100_000 },
  concurrency: { min: 1, max: 10_000 },
  queueSize: { min: 0, max: 100_000 },
  queueWaitSeconds: { min: 1, max: 86_400 },
  subAccounts: { min: 0, max: 1000 },
};

/** A limit as its box shows it: dollars for money, the whole number otherwise. */
export function limitText(name: LimitName, value: number | null): string {
  if (value === null) return "";
  return String(isMoneyLimit(name) ? toDollars(value) : value);
}

/** A typed limit in the API's unit: null when empty, NaN when it isn't a valid value for that limit. */
export function parseLimit(name: LimitName, text: string): number | null {
  if (isMoneyLimit(name)) {
    const dollars = parseDollars(text);
    if (dollars === null) return null;
    return dollars > 0 ? toMicros(dollars) : Number.NaN;
  }
  const n = parseCount(text);
  const bounds = LIMIT_BOUNDS[name];
  return n === null || (bounds && n >= bounds.min && n <= bounds.max) ? n : Number.NaN;
}

/** "120", "1h" for a queue wait, "$250.00" for an amount, "None" for a spend limit that isn't set. */
export function formatLimit(name: LimitName, value: number | null): string {
  if (value === null) return "None";
  if (isMoneyLimit(name)) return usd(value);
  if (name === "queueWaitSeconds") return value % 60 === 0 ? span(value / 60) : `${integer(value)} s`;
  return integer(value);
}
