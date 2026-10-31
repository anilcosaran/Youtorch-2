import type { BillingUnit, Disclosure, Modality, ModelVersion, PriceTier, Pricing, Route, RoutingPolicy } from "@modelvend/admin-api/models";
import type { ProviderRecord } from "./types";

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

/** Each tier's cost is what the primary route charges at it; null without a route or a cost for the tier. */
export function withTierCosts(pricing: Pricing, routes: Route[]): Pricing {
  const primary = primaryRoute({ routes });
  return {
    ...pricing,
    tiers: pricing.tiers.map((tier) => ({ ...tier, cost: primary?.tierCosts[tier.id] ?? null })),
  };
}

/** "Google and Kling" for messages. */
export function listNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Versions that answer customers, so they need an active route. */
export const answers = (version: Pick<ModelVersion, "status">) => version.status === "live" || version.status === "deprecated";

export const activeRoutes = (version: Pick<ModelVersion, "routes">) => version.routes.filter((route) => route.status === "active");

/**
 * Routes that can really serve the version: active, on an active provider and, for a white label model, on one whose
 * terms allow it. The router skips the rest, so a version needs one of these to go live.
 */
export function usableRoutes(version: Pick<ModelVersion, "routes">, providers: readonly ProviderRecord[], disclosure: Disclosure): Route[] {
  return activeRoutes(version).filter((route) => {
    const provider = providers.find((p) => p.id === route.providerId);
    return provider?.status === "active" && (disclosure !== "white_label" || provider.whiteLabelAllowed);
  });
}

/**
 * Where a version's pricing doesn't fit its input schema, so a valid input couldn't be priced: the field at fault and
 * why, or null. The same checks as the catalog import in services/internal/catalog/manifest.
 */
export function pricingProblem(version: Pick<ModelVersion, "pricing" | "inputSchema">): { field: string; message: string } | null {
  const { pricing, inputSchema } = version;
  const properties = (inputSchema.properties ?? {}) as Record<string, { enum?: unknown[] } | undefined>;
  const tiers = new Set(pricing.tiers.map((tier) => tier.id));
  if (pricing.tierField === null) {
    if (Object.keys(pricing.tierValues).length > 0) return { field: "pricing.tierValues", message: "Tier values need a tier field." };
  } else {
    const values = properties[pricing.tierField]?.enum;
    if (!properties[pricing.tierField]) return { field: "pricing.tierField", message: `"${pricing.tierField}" isn't in the input schema.` };
    if (!values) return { field: "pricing.tierField", message: `"${pricing.tierField}" needs an enum in the input schema.` };
    for (const value of values) {
      const tier = pricing.tierValues[String(value)] ?? String(value);
      if (!tiers.has(tier)) return { field: "pricing.tierValues", message: `"${String(value)}" picks no tier.` };
    }
  }
  if (pricing.input && !properties[pricing.input.field]) {
    return { field: "pricing.input.field", message: `"${pricing.input.field}" isn't in the input schema.` };
  }
  return null;
}
