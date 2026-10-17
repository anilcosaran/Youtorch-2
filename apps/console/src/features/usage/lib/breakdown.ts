import { hash } from "@/lib/random";
import type { DailyUsage } from "@/types/usage";

export type Dimension = "model" | "modality" | "key";
export type Metric = "spend" | "requests";

export interface BreakdownRow {
  key: string;
  label: string;
  /** Secondary text, e.g. a model's modality. */
  detail?: string;
  href?: string;
  /** Fixed color, e.g. for modalities; ranked rows get one from the palette otherwise. */
  color?: string;
  spend: number[];
  requests: number[];
}

export const seriesPalette = [
  "var(--color-iris-400)",
  "var(--color-sky-chart)",
  "var(--color-jade-400)",
  "var(--color-amber-chart)",
  "var(--color-rose-400)",
  "var(--color-teal-chart)",
];

export const otherColor = "color-mix(in oklab, var(--color-white) 24%, transparent)";

export const rowTotal = (row: BreakdownRow, metric: Metric) => row[metric].reduce((s, v) => s + v, 0);

/**
 * Splits a day's total across fixed shares with some day-to-day drift so the
 * sample lines don't run parallel. Requests stay whole and add up exactly.
 */
export function splitByShare(day: DailyUsage, total: number, shares: number[], whole: boolean) {
  const seed = hash(day.label);
  const drift = shares.map((s, k) => s * (1 + 0.22 * Math.sin(seed * 1.9 + k * 2.4)));
  const sum = drift.reduce((a, b) => a + b, 0) || 1;
  const parts = drift.map((d) => (total * d) / sum);
  if (!whole) return parts;
  const rounded = parts.map(Math.round);
  rounded[rounded.length - 1] = total - rounded.slice(0, -1).reduce((a, b) => a + b, 0);
  return rounded;
}
