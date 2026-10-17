import type { DailyUsage } from "@/types/usage";

export type DayMetric = (day: DailyUsage) => number;

const MAX_POINTS = 30;

export const sum = (days: DailyUsage[], metric: DayMetric) => days.reduce((s, d) => s + metric(d), 0);

const requests: DayMetric = (d) => d.requests;

export const errorRate = (days: DailyUsage[]) => sum(days, (d) => d.errors) / Math.max(1, sum(days, requests));

/** Request-weighted median latency in milliseconds. */
export const p50 = (days: DailyUsage[]) => sum(days, (d) => d.p50 * d.requests) / Math.max(1, sum(days, requests));

/** Groups days so long periods still render at most `MAX_POINTS` bars. */
export function buckets(days: DailyUsage[]) {
  const size = Math.ceil(days.length / MAX_POINTS);
  return Array.from({ length: Math.ceil(days.length / size) }, (_, i) => days.slice(i * size, (i + 1) * size));
}

/** Relative change, or undefined when there is nothing to compare against. */
export function change(current: number, previous: number) {
  return previous ? (current - previous) / previous : undefined;
}
