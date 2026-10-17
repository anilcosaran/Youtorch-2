import type { ApiKeyRow } from "@modelvend/admin-api/api-keys";
import type { App, AppRelease, AppSummary } from "@modelvend/admin-api/apps";
import type { Operator } from "@modelvend/admin-api/auth";
import { TIER_LIMITS, type Customer, type CustomerRow, type Limits } from "@modelvend/admin-api/customers";
import type { Model, ModelSummary, ModelVersion } from "@modelvend/admin-api/models";
import type { Provider } from "@modelvend/admin-api/providers";
import type { RequestDetail, RequestRow } from "@modelvend/admin-api/requests";
import { PERMISSIONS } from "@/lib/permissions";
import { TYPICAL_UNITS, activeRoutes, byPriority, defaultTier, withTierCosts } from "./catalog";
import type { ApiKeyRecord, AppRecord, CustomerRecord, ModelRecord, OperatorRecord, ProviderRecord, ReleaseRecord, Store } from "./types";
import { clone, round, sum, unique } from "./util";

/*
 * Records as the API answers them, with derived fields computed now.
 * Everything returned is a copy, so a caller can't change the store by accident.
 */

export function operatorView(operator: OperatorRecord): Operator {
  return {
    id: operator.id,
    email: operator.email,
    name: operator.name,
    role: operator.role,
    permissions: operator.role === "admin" ? [...PERMISSIONS] : [...operator.permissions],
    createdAt: operator.createdAt,
    lastLoginAt: operator.lastLoginAt,
    disabled: operator.disabled,
  };
}

const newestFirst = (a: { createdAt: string }, b: { createdAt: string }) => b.createdAt.localeCompare(a.createdAt);

function versionView(store: Store, model: ModelRecord, version: ModelVersion): ModelVersion {
  const routes = [...version.routes].sort(byPriority).map((route) => ({
    ...clone(route),
    providerName: store.providers.find((p) => p.id === route.providerId)?.name ?? route.providerId,
  }));
  return {
    ...clone(version),
    isDefault: model.defaultVersion === version.id,
    pricing: withTierCosts(clone(version.pricing), routes),
    routes,
  };
}

export function findVersion(model: ModelRecord, id: string | null): ModelVersion | null {
  return model.versionList.find((version) => version.id === id) ?? null;
}

export function modelSummary(store: Store, model: ModelRecord): ModelSummary {
  const statuses = model.versionList.map((v) => v.status);
  const current = findVersion(model, model.defaultVersion);
  const tier = current ? defaultTier(current.pricing) : null;
  return {
    id: model.id,
    publisher: model.publisher,
    slug: model.slug,
    name: model.name,
    modality: model.modality,
    tasks: [...model.tasks],
    state: model.state,
    visibility: model.visibility,
    featured: model.featured,
    defaultVersion: model.defaultVersion,
    versions: {
      total: statuses.length,
      live: statuses.filter((s) => s === "live").length,
      draft: statuses.filter((s) => s === "draft" || s === "staging").length,
      deprecated: statuses.filter((s) => s === "deprecated").length,
    },
    providers: current ? unique(activeRoutes(current).sort(byPriority).map((route) => route.providerId)) : [],
    price: current && tier ? { unit: current.pricing.unit, price: tier.price } : null,
    requests24h: model.requests24h,
    errorRate24h: model.errorRate24h,
    revenue30d: model.revenue30d,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
  };
}

export function modelView(store: Store, model: ModelRecord): Model {
  return {
    ...modelSummary(store, model),
    description: model.description,
    inputs: [...model.inputs],
    outputs: [...model.outputs],
    tags: [...model.tags],
    license: model.license,
    pausedReason: model.pausedReason,
    versionList: [...model.versionList].sort(newestFirst).map((version) => versionView(store, model, version)),
  };
}

/** Routes through the provider on versions that haven't been retired. */
function providerRoutes(store: Store, providerId: string) {
  return store.models.flatMap((model) =>
    model.versionList
      .filter((version) => version.status !== "retired")
      .flatMap((version) => version.routes.filter((route) => route.providerId === providerId).map((route) => ({ model, route }))),
  );
}

export function providerView(store: Store, provider: ProviderRecord): Provider {
  const routes = providerRoutes(store, provider.id);
  return {
    ...clone(provider),
    routes: routes.length,
    models: unique(routes.map(({ model }) => model.id)).length,
    requests24h: sum(routes, ({ route }) => route.health.requests24h),
  };
}

/** Upstream cost of one run: each step's typical units (or its fixed duration or image count) at the default tier's cost. */
export function releaseView(store: Store, release: ReleaseRecord): AppRelease {
  let cost = 0;
  for (const step of release.steps) {
    const model = store.models.find((m) => m.id === step.modelId);
    const version = model ? findVersion(model, step.version) : null;
    if (!version) continue;
    const { unit } = version.pricing;
    const tierCost = defaultTier(withTierCosts(version.pricing, version.routes)).cost ?? 0;
    const fixed = unit === "second" ? step.params.duration : unit === "image" ? step.params.num_images : undefined;
    cost += (typeof fixed === "number" ? fixed : TYPICAL_UNITS[unit]) * tierCost;
  }
  return { ...clone(release), cost: round(cost, 4) };
}

export function appSummary(store: Store, app: AppRecord): AppSummary {
  const live = app.releases.find((r) => r.status === "live") ?? null;
  const draft = app.releases.find((r) => r.status === "draft") ?? null;
  return {
    slug: app.slug,
    name: app.name,
    tagline: app.tagline,
    category: app.category,
    status: app.status,
    liveRelease: live?.number ?? null,
    draftRelease: draft?.number ?? null,
    models: live ? unique(live.steps.map((step) => step.modelId)) : [],
    price: live?.price ?? null,
    runs24h: app.runs24h,
    revenue30d: app.revenue30d,
    updatedAt: app.updatedAt,
  };
}

export function appView(store: Store, app: AppRecord): App {
  return {
    ...appSummary(store, app),
    description: app.description,
    releases: [...app.releases].sort((a, b) => b.number - a.number).map((release) => releaseView(store, release)),
  };
}

export const activeKeyCount = (store: Store, customerId: string) =>
  store.apiKeys.filter((key) => key.customerId === customerId && key.status === "active").length;

export function customerRow(store: Store, customer: CustomerRecord): CustomerRow {
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    workspace: customer.workspace,
    tier: customer.tier,
    status: customer.status,
    balance: customer.balance,
    spend30d: customer.spend30d,
    requests30d: customer.requests30d,
    keys: activeKeyCount(store, customer.id),
    createdAt: customer.createdAt,
    lastActiveAt: customer.lastActiveAt,
  };
}

export function customerView(store: Store, customer: CustomerRecord): Customer {
  const overrides = (Object.keys(customer.limitOverrides) as (keyof Limits)[]).filter((key) => customer.limitOverrides[key] !== undefined);
  return {
    ...customerRow(store, customer),
    limits: { ...TIER_LIMITS[customer.tier], ...customer.limitOverrides },
    overrides,
    autoReload: { ...customer.autoReload },
    suspendedReason: customer.suspendedReason,
    usage: clone(customer.usage),
    topModels: clone(customer.topModels),
    ledger: clone(customer.ledger),
  };
}

export function apiKeyView(store: Store, key: ApiKeyRecord): ApiKeyRow {
  const customer = store.customers.find((c) => c.id === key.customerId);
  const { customerId, ...row } = key;
  return {
    ...clone(row),
    customer: { id: customerId, name: customer?.name ?? "", workspace: customer?.workspace ?? "" },
  };
}

export function requestRow(request: RequestDetail): RequestRow {
  return {
    id: request.id,
    model: request.model,
    version: request.version,
    app: request.app,
    customer: { ...request.customer },
    keyPrefix: request.keyPrefix,
    status: request.status,
    provider: request.provider,
    attempts: request.attempts,
    latencyMs: request.latencyMs,
    units: request.units,
    unit: request.unit,
    price: request.price,
    cost: request.cost,
    errorCode: request.errorCode,
    createdAt: request.createdAt,
  };
}

export const requestView = (request: RequestDetail): RequestDetail => clone(request);
