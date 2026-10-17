import { request, type Page, type PageParams } from "./client";

/*
 * The catalog. A model is the public identity callers address
 * (`publisher/slug`, e.g. `google/veo-3.1`); a version is an immutable
 * release of it with its own schema, price and provider routes. Callers get
 * the default version unless they pin one (`google/veo-3.1@v2`).
 *
 * Unit prices and costs are US dollars per billing unit. Totals (revenue,
 * spend) are US dollars too; the API sends them as numbers with up to six
 * decimals and stores them as integer micro-dollars.
 */

export const MODALITIES = ["image", "video", "audio", "3d", "text"] as const;
export type Modality = (typeof MODALITIES)[number];

export type Medium = "text" | "image" | "video" | "audio" | "3d";

/** The kill switch: a paused model refuses new requests with 503 `model_paused`. */
export const MODEL_STATES = ["active", "paused"] as const;
export type ModelState = (typeof MODEL_STATES)[number];

/** Public models are listed; unlisted ones answer but aren't listed; private ones answer allowlisted workspaces only. */
export const VISIBILITIES = ["public", "unlisted", "private"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

/**
 * draft → staging → live → deprecated → retired. Staging answers internal
 * keys only; deprecated still answers with `Deprecation`/`Sunset` headers;
 * retired answers 410, or forwards to its replacement when one is set.
 */
export const VERSION_STATUSES = ["draft", "staging", "live", "deprecated", "retired"] as const;
export type VersionStatus = (typeof VERSION_STATUSES)[number];

export const BILLING_UNITS = ["image", "megapixel", "second", "minute", "request", "1k_chars", "1m_tokens", "mesh"] as const;
export type BillingUnit = (typeof BILLING_UNITS)[number];

export interface UnitPrice {
  unit: BillingUnit;
  price: number;
}

export interface PriceTier {
  id: string;
  /** What the tier is, e.g. "1080p" or "4MP". */
  label: string;
  /** Sell price per unit. */
  price: number;
  /** Upstream cost per unit for this tier, from the primary route. */
  cost: number | null;
}

export interface Pricing {
  unit: BillingUnit;
  /** The tier billed when the request doesn't pick one. */
  defaultTier: string;
  tiers: PriceTier[];
  /** Charged per input unit when the model bills for reference media. */
  input: UnitPrice | null;
  /** Launch discount (0–1) applied on top of every tier. */
  promo: number | null;
}

export const ROUTING_STRATEGIES = ["priority", "cheapest", "fastest", "weighted"] as const;
export type RoutingStrategy = (typeof ROUTING_STRATEGIES)[number];

export interface RoutingPolicy {
  strategy: RoutingStrategy;
  /** Try the next route when one fails before producing output. */
  fallbacks: boolean;
  maxAttempts: number;
  timeoutSeconds: number;
}

export const ROUTE_STATUSES = ["active", "paused", "draining"] as const;
export type RouteStatus = (typeof ROUTE_STATUSES)[number];

export interface RouteHealth {
  /** Share of the last 24 hours' attempts that succeeded; null without traffic. */
  successRate: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  requests24h: number;
}

/** One way to serve a version: a provider and the model ID it knows it by. */
export interface Route {
  id: string;
  providerId: string;
  providerName: string;
  /** The provider's own ID, e.g. `fal-ai/kling-video/v3/pro/text-to-video`. */
  upstreamModel: string;
  status: RouteStatus;
  /** Lower goes first under the priority strategy. */
  priority: number;
  /** Share of traffic under the weighted strategy (0–100). */
  weight: number;
  /** What the provider charges us per unit at the default tier. */
  cost: UnitPrice;
  region: string;
  maxConcurrency: number | null;
  health: RouteHealth;
  updatedAt: string;
}

/** JSON Schema (draft 2020-12) for a version's input or output. */
export type JsonSchema = Record<string, unknown>;

export interface ModelVersion {
  /** Stable, URL-safe and unique within the model: "v3", "2026-10-01". */
  id: string;
  modelId: string;
  /** Human version, e.g. "3.0". */
  label: string;
  status: VersionStatus;
  isDefault: boolean;
  changelog: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  pricing: Pricing;
  routing: RoutingPolicy;
  routes: Route[];
  /** Version callers are pointed to once this one is deprecated or retired. */
  replacement: string | null;
  createdAt: string;
  createdBy: string | null;
  releasedAt: string | null;
  deprecatedAt: string | null;
  /** When a deprecated version stops answering. */
  sunsetAt: string | null;
  requests24h: number;
}

export interface VersionCounts {
  total: number;
  live: number;
  draft: number;
  deprecated: number;
}

export interface ModelSummary {
  /** `publisher/slug`. */
  id: string;
  publisher: string;
  slug: string;
  name: string;
  modality: Modality;
  /** What it does, e.g. "text-to-video", "image-to-video". */
  tasks: string[];
  state: ModelState;
  visibility: Visibility;
  featured: boolean;
  defaultVersion: string | null;
  versions: VersionCounts;
  /** Providers with an active route on the default version. */
  providers: string[];
  /** Default tier of the default version. */
  price: UnitPrice | null;
  requests24h: number;
  errorRate24h: number | null;
  revenue30d: number;
  createdAt: string;
  updatedAt: string;
}

export interface Model extends ModelSummary {
  description: string;
  inputs: Medium[];
  outputs: Medium[];
  tags: string[];
  license: string | null;
  /** Why the model is paused, when it is. */
  pausedReason: string | null;
  versionList: ModelVersion[];
}

export interface ModelFilters {
  query?: string;
  modality?: Modality;
  state?: ModelState;
  visibility?: Visibility;
  provider?: string;
}

export interface NewModel {
  publisher: string;
  slug: string;
  name: string;
  modality: Modality;
  tasks: string[];
  description: string;
  visibility: Visibility;
}

export type ModelUpdate = Partial<
  Pick<Model, "name" | "description" | "tasks" | "visibility" | "featured" | "tags" | "license" | "inputs" | "outputs">
>;

export interface NewVersion {
  id: string;
  label: string;
  /** Copies schema, pricing, routing and routes from this version. */
  from?: string;
  changelog?: string;
}

export type VersionUpdate = Partial<Pick<ModelVersion, "label" | "changelog" | "inputSchema" | "outputSchema" | "pricing" | "routing">>;

export interface NewRoute {
  providerId: string;
  upstreamModel: string;
  priority: number;
  weight: number;
  cost: UnitPrice;
  region: string;
  maxConcurrency: number | null;
}

export type RouteUpdate = Partial<Pick<Route, "upstreamModel" | "status" | "priority" | "weight" | "cost" | "region" | "maxConcurrency">>;

/** `google/veo-3.1` stays readable in paths; each part is encoded on its own. */
const path = (id: string) => id.split("/").map(encodeURIComponent).join("/");

export const listModels = (params: ModelFilters & PageParams) =>
  request<Page<ModelSummary>>("/models", { query: { ...params } });

export const getModel = (id: string) => request<Model>(`/models/${path(id)}`);

/** 409 `fields.slug` when the ID is taken. The model starts with an empty draft version `v1`. */
export const createModel = (body: NewModel) => request<Model>("/models", { method: "POST", body });

export const updateModel = (id: string, body: ModelUpdate) => request<Model>(`/models/${path(id)}`, { method: "PATCH", body });

/** Every version stops answering at once with 503 `model_paused`; nothing else changes. */
export const pauseModel = (id: string, reason: string) =>
  request<Model>(`/models/${path(id)}/pause`, { method: "POST", body: { reason } });

export const resumeModel = (id: string) => request<Model>(`/models/${path(id)}/resume`, { method: "POST" });

export const createVersion = (modelId: string, body: NewVersion) =>
  request<Model>(`/models/${path(modelId)}/versions`, { method: "POST", body });

/** Schema and pricing change only on draft and staging versions; live ones get a new version. */
export const updateVersion = (modelId: string, version: string, body: VersionUpdate) =>
  request<Model>(`/models/${path(modelId)}/versions/${encodeURIComponent(version)}`, { method: "PATCH", body });

/** draft → staging → live. 422 when the version has no active route or no price. */
export const promoteVersion = (modelId: string, version: string, to: "staging" | "live") =>
  request<Model>(`/models/${path(modelId)}/versions/${encodeURIComponent(version)}/promote`, { method: "POST", body: { to } });

/** Unpinned requests resolve to this version from now on. Only live versions can be the default. */
export const setDefaultVersion = (modelId: string, version: string) =>
  request<Model>(`/models/${path(modelId)}/versions/${encodeURIComponent(version)}/default`, { method: "POST" });

export const deprecateVersion = (modelId: string, version: string, body: { sunsetAt: string; replacement: string | null }) =>
  request<Model>(`/models/${path(modelId)}/versions/${encodeURIComponent(version)}/deprecate`, { method: "POST", body });

/** The version stops answering (410, or a forward to its replacement). Can't be undone. */
export const retireVersion = (modelId: string, version: string) =>
  request<Model>(`/models/${path(modelId)}/versions/${encodeURIComponent(version)}/retire`, { method: "POST" });

export const addRoute = (modelId: string, version: string, body: NewRoute) =>
  request<Model>(`/models/${path(modelId)}/versions/${encodeURIComponent(version)}/routes`, { method: "POST", body });

export const updateRoute = (modelId: string, version: string, routeId: string, body: RouteUpdate) =>
  request<Model>(`/models/${path(modelId)}/versions/${encodeURIComponent(version)}/routes/${routeId}`, {
    method: "PATCH",
    body,
  });

export const deleteRoute = (modelId: string, version: string, routeId: string) =>
  request<Model>(`/models/${path(modelId)}/versions/${encodeURIComponent(version)}/routes/${routeId}`, {
    method: "DELETE",
  });

/** Where a model's page lives in the console. */
export const modelHref = (id: string, version?: string) => `/models/${id}${version ? `?version=${encodeURIComponent(version)}` : ""}`;
