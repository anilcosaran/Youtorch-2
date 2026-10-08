import type { Modality } from "./model";

export interface DailyUsage {
  /** Day offset label, e.g. "Sep 08". */
  label: string;
  /** Long form for tooltips, e.g. "Oct 3, 2026 UTC". */
  date: string;
  spend: Record<Modality, number>;
  requests: number;
  errors: number;
  p50: number;
}

export interface RequestLog {
  id: string;
  model: string;
  endpoint: string;
  status: number;
  duration: number;
  cost: number;
  ago: string;
}
