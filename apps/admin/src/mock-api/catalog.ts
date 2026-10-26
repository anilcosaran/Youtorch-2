import type { BillingUnit, Modality, ModelVersion, PriceTier, Pricing, Route, RoutingPolicy } from "@modelvend/admin-api/models";
import { UNIT_LABELS } from "@/lib/labels";
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

/**
 * Each tier's cost: the primary route's cost scaled by the tier's price over the default tier's. Unknown (null)
 * without a route, or when the primary route costs in another unit than the version bills.
 */
export function withTierCosts(pricing: Pricing, routes: Route[]): Pricing {
  const primary = primaryRoute({ routes });
  const comparable = primary !== null && primary.cost.unit === pricing.unit ? primary : null;
  const base = defaultTier(pricing)?.price ?? 0;
  return {
    ...pricing,
    tiers: pricing.tiers.map((tier) => ({
      ...tier,
      cost: comparable ? round(base > 0 ? (comparable.cost.price * tier.price) / base : comparable.cost.price, 4) : null,
    })),
  };
}

/** Routes whose cost is in another unit than the version bills, so their cost can't be set against its price. */
export const mismatchedRoutes = (version: Pick<ModelVersion, "pricing" | "routes">) =>
  version.routes.filter((route) => route.cost.unit !== version.pricing.unit);

/** "per second", "per 1K characters" for messages. */
export const perUnit = (unit: BillingUnit) => `per ${UNIT_LABELS[unit]}`;

/** "fal and Replicate" for messages. */
export function listNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Versions that answer customers, so they need an active route. */
export const answers = (version: Pick<ModelVersion, "status">) => version.status === "live" || version.status === "deprecated";

export const activeRoutes = (version: Pick<ModelVersion, "routes">) => version.routes.filter((route) => route.status === "active");
