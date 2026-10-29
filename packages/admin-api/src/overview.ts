import type { HealthState } from "./providers";
import { request, type Range } from "./client";

/*
 * Any signed-in operator may load the overview, but it gathers figures that
 * other screens guard, so each one needs the permission that guards the same
 * data on its own screen. The server leaves out (omits, rather than sending
 * null) every figure the operator can't see, and the console hides what is
 * missing:
 *
 * | Figures                                                        | Needs                                        |
 * | -------------------------------------------------------------- | -------------------------------------------- |
 * | `requests24h`, `errorRate24h`; per day `requests`, `failed`    | requests.view                                |
 * | `revenue`; per day `revenue`                                   | catalog.view or customers.view               |
 * | `cost`; per day `cost`                                         | providers.view                               |
 * | `margin`                                                       | providers.view, and catalog.view or          |
 * |                                                                | customers.view (with cost it gives revenue)  |
 * | `activeCustomers7d`; per day `signups`                         | customers.view                               |
 * | `liveModels`, `pausedModels`, `deprecatedVersions`, `topModels` | catalog.view                                |
 * | `providersDegraded`, `providers`                               | providers.view                               |
 *
 * Revenue is on Models (per model) and Customers (per customer); upstream cost
 * is what providers charged us (Providers), so company-wide cost and margin
 * need providers.view. `null` keeps its own meaning: no traffic, so no rate.
 */

export interface OverviewDay {
  /** `YYYY-MM-DD`, UTC. */
  day: string;
  /** requests.view. */
  requests?: number;
  /** requests.view. */
  failed?: number;
  /** What customers paid. catalog.view or customers.view. */
  revenue?: number;
  /** What providers charged us. providers.view. */
  cost?: number;
  /** customers.view. */
  signups?: number;
}

export interface OverviewTotals {
  /** requests.view. */
  requests24h?: number;
  /** requests.view; null without traffic. */
  errorRate24h?: number | null;
  /** catalog.view or customers.view. */
  revenue?: number;
  /** providers.view. */
  cost?: number;
  /** (revenue − cost) ÷ revenue over the range; null without revenue. providers.view, and catalog.view or customers.view. */
  margin?: number | null;
  /** customers.view. */
  activeCustomers7d?: number;
  /** catalog.view. */
  liveModels?: number;
  /** catalog.view. */
  pausedModels?: number;
  /** providers.view. */
  providersDegraded?: number;
  /** catalog.view. */
  deprecatedVersions?: number;
}

export interface OverviewModel {
  modelId: string;
  name: string;
  requests: number;
  revenue: number;
}

export interface OverviewProvider {
  id: string;
  name: string;
  state: HealthState;
  successRate: number | null;
  p50Ms: number | null;
  requests24h: number;
}

export interface Overview {
  totals: OverviewTotals;
  /** One entry per UTC day of the range, oldest first, whatever the operator may see; fields as above. */
  series: OverviewDay[];
  /** catalog.view. */
  topModels?: OverviewModel[];
  /** providers.view. */
  providers?: OverviewProvider[];
}

export const getOverview = (range: Range) => request<Overview>("/overview", { query: { range } });
