import type { BillingUnit, Modality, ModelVersion, PriceTier, Pricing, Route, RoutingPolicy } from "@modelvend/admin-api/models";
import { round } from "./util";

/** Typical units one request bills, for estimates such as revenue and app costs. */
export const TYPICAL_UNITS: Record<BillingUnit, number> = {
  image: 1.3,
  megapixel: 8,
  second: 6.5,
  minute: 1,
  request: 1,
  "1k_chars": 0.9,
  "1m_tokens": 0.0015,
  mesh: 1,
};

/** What a new model bills by. */
export const UNIT_FOR: Record<Modality, BillingUnit> = {
  image: "image",
  video: "second",
  audio: "1k_chars",
  "3d": "mesh",
  text: "1m_tokens",
};

/** How long a request may run before the router gives up on a route. */
export const TIMEOUT_FOR: Record<Modality, number> = {
  image: 120,
  video: 600,
  audio: 120,
  "3d": 900,
  text: 30,
};

export const defaultRouting = (modality: Modality): RoutingPolicy => ({
  strategy: "priority",
  fallbacks: true,
  maxAttempts: 2,
  timeoutSeconds: TIMEOUT_FOR[modality],
});

export const byPriority = (a: Route, b: Route) => a.priority - b.priority;

/** The route that prices a version: the first active one by priority, else the first by priority. */
export function primaryRoute(version: Pick<ModelVersion, "routes">): Route | null {
  const routes = [...version.routes].sort(byPriority);
  return routes.find((route) => route.status === "active") ?? routes[0] ?? null;
}

export function defaultTier(pricing: Pricing): PriceTier {
  return pricing.tiers.find((tier) => tier.id === pricing.defaultTier) ?? pricing.tiers[0];
}

/** Each tier's cost: the primary route's cost scaled by the tier's price over the default tier's. */
export function withTierCosts(pricing: Pricing, routes: Route[]): Pricing {
  const primary = primaryRoute({ routes });
  const base = defaultTier(pricing)?.price ?? 0;
  return {
    ...pricing,
    tiers: pricing.tiers.map((tier) => ({
      ...tier,
      cost: primary ? round(base > 0 ? (primary.cost.price * tier.price) / base : primary.cost.price, 4) : null,
    })),
  };
}

/** Versions that answer customers, so they need an active route. */
export const answers = (version: Pick<ModelVersion, "status">) => version.status === "live" || version.status === "deprecated";

export const activeRoutes = (version: Pick<ModelVersion, "routes">) => version.routes.filter((route) => route.status === "active");
