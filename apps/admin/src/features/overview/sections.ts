import type { Overview } from "@modelvend/admin-api/overview";
import type { Permissions } from "@/lib/permissions";

/**
 * The parts of the overview an operator gets, one per permission rule in the
 * contract (`overview.ts` in packages/admin-api): traffic, revenue, upstream
 * cost, margin, customers, the catalog and provider health.
 */
export interface OverviewSections {
  traffic: boolean;
  revenue: boolean;
  cost: boolean;
  margin: boolean;
  customers: boolean;
  catalog: boolean;
  providers: boolean;
}

/**
 * What to show: what the server sent once it has answered, and until then
 * what the operator's permissions promise, so no section flashes in or out.
 * Null while neither is known.
 */
export function overviewSections(data: Overview | undefined, can: Permissions | null): OverviewSections | null {
  if (data) {
    const t = data.totals;
    return {
      traffic: t.requests24h !== undefined,
      revenue: t.revenue !== undefined,
      cost: t.cost !== undefined,
      margin: t.margin !== undefined,
      customers: t.activeCustomers7d !== undefined,
      catalog: t.liveModels !== undefined || data.topModels !== undefined,
      providers: t.providersDegraded !== undefined || data.providers !== undefined,
    };
  }
  if (!can) return null;
  const revenue = can.viewCatalog || can.viewCustomers;
  return {
    traffic: can.viewRequests,
    revenue,
    cost: can.viewProviders,
    margin: revenue && can.viewProviders,
    customers: can.viewCustomers,
    catalog: can.viewCatalog,
    providers: can.viewProviders,
  };
}

/** Whether there is anything at all to show. */
export const anySection = (sections: OverviewSections) => Object.values(sections).some(Boolean);
