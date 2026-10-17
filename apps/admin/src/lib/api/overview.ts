import type { HealthState } from "./providers";
import { request, type Range } from "./client";

export interface OverviewDay {
  /** `YYYY-MM-DD`, UTC. */
  day: string;
  requests: number;
  failed: number;
  /** What customers paid. */
  revenue: number;
  /** What providers charged us. */
  cost: number;
  signups: number;
}

export interface Overview {
  totals: {
    requests24h: number;
    errorRate24h: number | null;
    revenue: number;
    cost: number;
    /** (revenue − cost) ÷ revenue over the range. */
    margin: number | null;
    activeCustomers7d: number;
    liveModels: number;
    pausedModels: number;
    providersDegraded: number;
    deprecatedVersions: number;
  };
  series: OverviewDay[];
  topModels: { modelId: string; name: string; requests: number; revenue: number }[];
  providers: { id: string; name: string; state: HealthState; successRate: number | null; p50Ms: number | null; requests24h: number }[];
}

export const getOverview = (range: Range) => request<Overview>("/overview", { query: { range } });
