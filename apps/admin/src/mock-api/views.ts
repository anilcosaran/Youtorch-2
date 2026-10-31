import type { ApiKeyRow } from "@modelvend/admin-api/api-keys";
import type { App, AppRelease, AppSummary } from "@modelvend/admin-api/apps";
import type { Operator } from "@modelvend/admin-api/auth";
import { LIMIT_NAMES, limitsFor, type Customer, type CustomerRow } from "@modelvend/admin-api/customers";
import type { Model, ModelSummary, ModelVersion } from "@modelvend/admin-api/models";
import type { Provider } from "@modelvend/admin-api/providers";
import type { TaskDetail, TaskRow } from "@modelvend/admin-api/tasks";
import { PERMISSIONS } from "@/lib/permissions";
import { TYPICAL_UNITS, activeRoutes, byPriority, defaultTier, withTierCosts } from "./catalog";
import type { ApiKeyRecord, AppRecord, CustomerRecord, ModelRecord, OperatorRecord, ProviderRecord, ReleaseRecord, Store } from "./types";
import { clone, sum, toMicros, unique } from "./util";

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
    disclosure: model.disclosure,
    featured: model.featured,
    defaultVersion: model.defaultVersion,
    versions: {
      total: statuses.length,
      live: statuses.filter((s) => s === "live").length,
      draft: statuses.filter((s) => s === "draft").length,
      deprecated: statuses.filter((s) => s === "deprecated").length,
    },
    providers: current ? unique(activeRoutes(current).sort(byPriority).map((route) => route.providerId)) : [],
    price: current && tier ? { unit: current.pricing.unit, price: tier.price } : null,
    tasks24h: model.tasks24h,
    errorRate24h: model.errorRate24h,
    revenue30dMicros: model.revenue30dMicros,
    revision: model.revision,
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
    author: model.author,
    capabilities: [...model.capabilities],
    maxOutput: model.maxOutput ? { ...model.maxOutput } : null,
    gallery: clone(model.gallery),
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
    tasks24h: sum(routes, ({ route }) => route.health.tasks24h),
  };
}

/**
 * What one unit of a step costs: the tier its input pins, or the costliest when the run's input decides, so the
 * margin rule can't pass a price only the cheap tier would cover.
 */
function stepUnitCost(version: ModelVersion, input: Record<string, unknown>): number {
  const { pricing } = version;
  const costs = withTierCosts(pricing, version.routes).tiers;
  const value = pricing.tierField ? input[pricing.tierField] : undefined;
  if (value === undefined || value === null) return Number(defaultTier({ ...pricing, tiers: costs }).cost ?? 0);
  if (typeof value === "string" && value.includes("{{")) return Math.max(...costs.map((tier) => Number(tier.cost ?? 0)));
  const id = pricing.tierValues[String(value)] ?? String(value);
  return Number(costs.find((tier) => tier.id === id)?.cost ?? 0);
}

/** Upstream cost of one run: each step's typical units (or its fixed duration or image count) at the tier it runs at. */
export function releaseView(store: Store, release: ReleaseRecord): AppRelease {
  let cost = 0;
  for (const step of release.steps) {
    const [modelId, versionId] = step.model.split("@");
    const model = store.models.find((m) => m.id === modelId);
    const version = model ? findVersion(model, versionId) : null;
    if (!version) continue;
    const { unit } = version.pricing;
    const tierCost = stepUnitCost(version, step.input);
    const fixed = unit === "second" ? step.input.duration : unit === "image" ? step.input.num_images : undefined;
    cost += (typeof fixed === "number" ? fixed : TYPICAL_UNITS[unit]) * tierCost;
  }
  return { ...clone(release), costMicros: toMicros(cost) };
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
    models: live ? unique(live.steps.map((step) => step.model.split("@")[0])) : [],
    priceMicros: live?.priceMicros ?? null,
    runs24h: app.runs24h,
    revenue30dMicros: app.revenue30dMicros,
    updatedAt: app.updatedAt,
  };
}

export function appView(store: Store, app: AppRecord): App {
  return {
    ...appSummary(store, app),
    description: app.description,
    inputSchema: clone(app.inputSchema),
    outputSchema: clone(app.outputSchema),
    pausedReason: app.status === "paused" ? app.pausedReason : null,
    releases: [...app.releases].sort((a, b) => b.number - a.number).map((release) => releaseView(store, release)),
  };
}

export const activeKeyCount = (store: Store, customerId: string) =>
  store.apiKeys.filter((key) => key.customerId === customerId && key.status === "active").length;

export function customerRow(store: Store, customer: CustomerRecord): CustomerRow {
  return {
    id: customer.id,
    name: customer.name,
    owner: { ...customer.owner },
    status: customer.status,
    balanceMicros: customer.balanceMicros,
    heldMicros: customer.heldMicros,
    spend30dMicros: customer.spend30dMicros,
    tasks30d: customer.tasks30d,
    keys: activeKeyCount(store, customer.id),
    members: customer.memberEmails.length,
    createdAt: customer.createdAt,
    lastActiveAt: customer.lastActiveAt,
  };
}

export function customerView(store: Store, customer: CustomerRecord): Customer {
  const overrides = LIMIT_NAMES.filter((name) => customer.limitOverrides[name] !== undefined && customer.limitOverrides[name] !== null);
  return {
    ...customerRow(store, customer),
    limits: limitsFor(store.settings.limits, customer.limitOverrides),
    overrides,
    autoReload: { ...customer.autoReload },
    suspendedReason: customer.suspendedReason,
    usage: clone(customer.usage),
    topModels: clone(customer.topModels),
  };
}

export function apiKeyView(store: Store, key: ApiKeyRecord): ApiKeyRow {
  const customer = store.customers.find((c) => c.id === key.customerId);
  const { customerId, ...row } = key;
  return {
    ...clone(row),
    customer: { id: customerId, name: customer?.name ?? "" },
  };
}

export function taskRow(task: TaskDetail): TaskRow {
  return {
    id: task.id,
    model: task.model,
    version: task.version,
    app: task.app,
    parentId: task.parentId,
    stage: task.stage,
    customer: { ...task.customer },
    keyPrefix: task.keyPrefix,
    status: task.status,
    provider: task.provider,
    attempts: task.attempts,
    latencyMs: task.latencyMs,
    units: task.units,
    unit: task.unit,
    tier: task.tier,
    amountMicros: task.amountMicros,
    costMicros: task.costMicros,
    holdMicros: task.holdMicros,
    errorCode: task.errorCode,
    createdAt: task.createdAt,
  };
}

export const taskView = (task: TaskDetail): TaskDetail => clone(task);
