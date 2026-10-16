import type { Limits } from "@/lib/api/customers";
import { integer, usd } from "@/lib/format";

export type LimitKey = keyof Limits;

export const LIMIT_KEYS: readonly LimitKey[] = ["requestsPerMinute", "concurrency", "monthlySpendCap"];

export const LIMIT_LABELS: Record<LimitKey, string> = {
  requestsPerMinute: "Requests per minute",
  concurrency: "Concurrent requests",
  monthlySpendCap: "Monthly spend cap",
};

export const LIMIT_DESCRIPTIONS: Record<LimitKey, string> = {
  requestsPerMinute: "Across every key of the workspace; requests above it are refused until the minute passes.",
  concurrency: "How many of the workspace's requests may run at the same time.",
  monthlySpendCap: "Requests stop once the month's spend reaches it.",
};

/** "120", or "$250.00" and "No cap" for the spend cap. */
export function formatLimit(key: LimitKey, value: number | null): string {
  if (key === "monthlySpendCap") return value === null ? "No cap" : usd(value);
  return value === null ? "—" : integer(value);
}
