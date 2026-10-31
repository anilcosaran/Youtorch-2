import { request, type PageParams } from "./client";
import type { S } from "./schema";

/*
 * The catalog. A model is the public identity callers address
 * (`publisher/slug`, e.g. `google/veo-3.1`); a version is an immutable
 * release of it with its own schema and provider routes. Callers get the
 * default version unless they pin one (`google/veo-3.1@v2`).
 */

export type Modality = S["Modality"];
export const MODALITIES = ["image", "video", "audio", "3d", "text"] as const satisfies readonly Modality[];

export type Medium = S["Medium"];

export type ModelState = S["ModelState"];
export const MODEL_STATES = ["active", "paused"] as const satisfies readonly ModelState[];

export type Visibility = S["Visibility"];
export const VISIBILITIES = ["public", "unlisted", "private"] as const satisfies readonly Visibility[];

export type Disclosure = S["Disclosure"];
export const DISCLOSURES = ["open", "white_label"] as const satisfies readonly Disclosure[];

export type VersionStatus = S["VersionStatus"];
export const VERSION_STATUSES = ["draft", "live", "deprecated", "retired"] as const satisfies readonly VersionStatus[];

export type BillingUnit = S["BillingUnit"];
export const BILLING_UNITS = ["image", "megapixel", "second", "minute", "request", "1k_chars", "1m_tokens", "mesh"] as const satisfies readonly BillingUnit[];

export type RoutingStrategy = S["RoutingStrategy"];
export const ROUTING_STRATEGIES = ["priority", "cheapest", "fastest", "weighted"] as const satisfies readonly RoutingStrategy[];

export type RouteStatus = S["RouteStatus"];
export const ROUTE_STATUSES = ["active", "paused", "draining"] as const satisfies readonly RouteStatus[];

export type PriceTier = S["PriceTier"];
export type InputPrice = S["InputPrice"];
export type Pricing = S["Pricing"];
export type PricingInput = S["PricingInput"];
export type RoutingPolicy = S["RoutingPolicy"];
export type RouteHealth = S["RouteHealth"];
export type TierCosts = S["TierCosts"];
export type Route = S["Route"];
export type ModelVersion = S["ModelVersion"];
export type VersionCounts = S["VersionCounts"];
export type ModelSummary = S["ModelSummary"];
export type Model = S["Model"];
export type NewModel = S["NewModel"];
export type ModelUpdate = S["ModelUpdate"];
export type NewVersion = S["NewVersion"];
export type VersionUpdate = S["VersionUpdate"];
export type NewRoute = S["NewRoute"];
export type RouteUpdate = S["RouteUpdate"];
export type GalleryItem = S["GalleryItem"];
export type MaxOutput = S["MaxOutput"];

/** JSON Schema (draft 2020-12) for a version's input or output. */
export type JsonSchema = S["JsonObject"];

export interface ModelFilters {
  query?: string;
  modality?: Modality;
  state?: ModelState;
  visibility?: Visibility;
  provider?: string;
}

/** `google/veo-3.1` stays readable in paths; each part is encoded on its own. */
const path = (id: string) => id.split("/").map(encodeURIComponent).join("/");
const versionPath = (modelId: string, version: string) => `/models/${path(modelId)}/versions/${encodeURIComponent(version)}`;
const routePath = (modelId: string, version: string, routeId: string) => `${versionPath(modelId, version)}/routes/${encodeURIComponent(routeId)}`;

/** The model's `revision` the edit is based on; 409 `stale` when it changed since. */
const basedOn = (revision: number) => ({ "If-Match": String(revision) });

export const listModels = (params: ModelFilters & PageParams) => request<S["ModelPage"]>("/models", { query: { ...params } });

export const getModel = (id: string) => request<Model>(`/models/${path(id)}`);

export const createModel = (body: NewModel) => request<Model>("/models", { method: "POST", body });

export const updateModel = (id: string, revision: number, body: ModelUpdate) =>
  request<Model>(`/models/${path(id)}`, { method: "PATCH", body, headers: basedOn(revision) });

export const pauseModel = (id: string, reason: string) => request<Model>(`/models/${path(id)}/pause`, { method: "POST", body: { reason } });

export const resumeModel = (id: string) => request<Model>(`/models/${path(id)}/resume`, { method: "POST" });

export const createVersion = (modelId: string, body: NewVersion) => request<Model>(`/models/${path(modelId)}/versions`, { method: "POST", body });

export const updateVersion = (modelId: string, version: string, revision: number, body: VersionUpdate) =>
  request<Model>(versionPath(modelId, version), { method: "PATCH", body, headers: basedOn(revision) });

export const publishVersion = (modelId: string, version: string, body: S["PublishVersion"] = {}) =>
  request<Model>(`${versionPath(modelId, version)}/publish`, { method: "POST", body });

export const setDefaultVersion = (modelId: string, version: string) => request<Model>(`${versionPath(modelId, version)}/default`, { method: "POST" });

export const deprecateVersion = (modelId: string, version: string, body: S["DeprecateVersion"]) =>
  request<Model>(`${versionPath(modelId, version)}/deprecate`, { method: "POST", body });

export const retireVersion = (modelId: string, version: string) => request<Model>(`${versionPath(modelId, version)}/retire`, { method: "POST" });

export const addRoute = (modelId: string, version: string, revision: number, body: NewRoute) =>
  request<Model>(`${versionPath(modelId, version)}/routes`, { method: "POST", body, headers: basedOn(revision) });

export const updateRoute = (modelId: string, version: string, routeId: string, revision: number, body: RouteUpdate) =>
  request<Model>(routePath(modelId, version, routeId), { method: "PATCH", body, headers: basedOn(revision) });

export const deleteRoute = (modelId: string, version: string, routeId: string, revision: number) =>
  request<Model>(routePath(modelId, version, routeId), { method: "DELETE", headers: basedOn(revision) });
