import type { Modality } from "./model";

export interface DailyUsage {
  /** ISO date (UTC), e.g. "2026-10-03". */
  day: string;
  /** Day offset label, e.g. "Sep 08". */
  label: string;
  /** Long form for tooltips, e.g. "Oct 3, 2026 UTC". */
  date: string;
  spend: Record<Modality, number>;
  /** Per-model split of `spend` and `requests`, keyed by model slug. */
  models: Record<string, { spend: number; requests: number }>;
  requests: number;
  errors: number;
  p50: number;
}

export interface RequestLog {
  id: string;
  /** Model ID, e.g. `google/veo-3.1`. */
  model: string;
  endpoint: string;
  status: number;
  duration: number;
  cost: number;
  ago: string;
}
