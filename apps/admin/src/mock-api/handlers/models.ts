import {
  BILLING_UNITS,
  MODALITIES,
  ROUTE_STATUSES,
  ROUTING_STRATEGIES,
  VISIBILITIES,
  type Medium,
  type ModelVersion,
  type Pricing,
  type Route,
  type RoutingPolicy,
  type UnitPrice,
} from "@/lib/api/models";
import { matchesQuery } from "@/lib/search";
import { audit, changes } from "../audit";
import { UNIT_FOR, activeRoutes, answers, defaultRouting, withTierCosts } from "../catalog";
import { conflict, invalid, invalidState, notFound, paginate } from "../http";
import { actor, route, type Context, type RouteDef } from "../router";
import { EMPTY_INPUT, outputFor } from "../seed/schemas";
import type { ModelRecord, Store } from "../types";
import { clone, sameJson } from "../util";
import {
  ID_PATTERN,
  bool,
  checkNumber,
  futureDate,
  has,
  idField,
  isObject,
  nested,
  nullableNumber,
  number,
  oneOf,
  reason,
  stringList,
  text,
  within,
  type Body,
} from "../validate";
import { modelSummary, modelView } from "../views";

const MEDIA: readonly Medium[] = ["text", "image", "video", "audio", "3d"];
const now = () => new Date().toISOString();

function findModel(store: Store, params: Record<string, string>): ModelRecord {
  return store.models.find((m) => m.id === `${params.publisher}/${params.slug}`) ?? notFound("model");
}

function findVersion(model: ModelRecord, id: string): ModelVersion {
  return model.versionList.find((v) => v.id === id) ?? notFound("version");
}

function findRoute(version: ModelVersion, id: string): Route {
  return version.routes.find((r) => r.id === id) ?? notFound("route");
}

/** The model and version a version route names. */
function target(ctx: Context) {
  const model = findModel(ctx.store, ctx.params);
  const version = findVersion(model, ctx.params.version);
  return { model, version, versionId: `${model.id}@${version.id}` };
}

/** Marks the model changed and answers with it. */
function done(ctx: Context, model: ModelRecord) {
  model.updatedAt = now();
  return modelView(ctx.store, model);
}

function readUnitPrice(value: Body): UnitPrice {
  return {
    unit: oneOf(value, "unit", BILLING_UNITS, true),
    price: checkNumber(value.price, "price", { min: 0 }),
  };
}

function readPricing(value: Body): Pricing {
  const unit = oneOf(value, "unit", BILLING_UNITS, true);
  if (!Array.isArray(value.tiers) || value.tiers.length === 0) invalid("tiers", "Add at least one price tier.");
  const tiers = (value.tiers as unknown[]).map((tier, index) =>
    within(`tiers.${index}`, () => {
      if (!isObject(tier)) return invalid("tier", "Must be an object.");
      return {
        id: idField(tier, "id", "tier ID"),
        label: text(tier, "label", { max: 40, required: "Enter a label." }),
        price: checkNumber(tier.price, "price", { min: 0 }),
        cost: null,
      };
    }),
  );
  if (new Set(tiers.map((t) => t.id)).size !== tiers.length) invalid("tiers", "Give each tier its own ID.");
  const defaultTier = text(value, "defaultTier", { required: "Pick the default tier." });
  if (!tiers.some((t) => t.id === defaultTier)) invalid("defaultTier", "Pick one of the tiers.");
  const input = value.input === null || value.input === undefined ? null : within("input", () => readUnitPrice(nested(value, "input")));
  const promo = nullableNumber(value, "promo", { min: 0, max: 0.99 }) ?? null;
  return { unit, defaultTier, tiers, input, promo };
}

function readRouting(value: Body, current: RoutingPolicy): RoutingPolicy {
  return {
    strategy: oneOf(value, "strategy", ROUTING_STRATEGIES) ?? current.strategy,
    fallbacks: bool(value, "fallbacks") ?? current.fallbacks,
    maxAttempts: number(value, "maxAttempts", { min: 1, max: 5, integer: true }) ?? current.maxAttempts,
    timeoutSeconds: number(value, "timeoutSeconds", { min: 5, max: 3600, integer: true }) ?? current.timeoutSeconds,
  };
}

function readSchema(body: Body, field: string) {
  const value = body[field];
  if (!isObject(value)) return invalid(field, "Must be a JSON Schema object.");
  return clone(value);
}

// ---- Models

function listModels({ store, query }: Context) {
  const q = query.get("query") ?? "";
  const modality = query.get("modality");
  const state = query.get("state");
  const visibility = query.get("visibility");
  const provider = query.get("provider");
  const items = store.models
    .map((model) => modelSummary(store, model))
    .filter(
      (m) =>
        matchesQuery(q, m.name, m.id, m.publisher, m.tasks.join(" ")) &&
        (!modality || m.modality === modality) &&
        (!state || m.state === state) &&
        (!visibility || m.visibility === visibility) &&
        (!provider || m.providers.includes(provider)),
    )
    .sort((a, b) => b.requests24h - a.requests24h || a.name.localeCompare(b.name));
  return paginate(items, query);
}

function createModel(ctx: Context) {
  const { store, body } = ctx;
  const publisher = idField(body, "publisher", "publisher");
  const slug = idField(body, "slug", "slug");
  const name = text(body, "name", { max: 80, required: "Enter a name." });
  const modality = oneOf(body, "modality", MODALITIES, true);
  const tasks = stringList(body, "tasks", 10) ?? [];
  const description = text(body, "description", { max: 2000 }) ?? "";
  const visibility = oneOf(body, "visibility", VISIBILITIES) ?? "public";
  const id = `${publisher}/${slug}`;
  if (store.models.some((m) => m.id === id)) conflict("A model with this ID already exists.", { slug: "A model with this ID already exists." });
  const at = now();
  const createdBy = actor(ctx).name;
  const model: ModelRecord = {
    id,
    publisher,
    slug,
    name,
    modality,
    tasks,
    state: "active",
    visibility,
    featured: false,
    defaultVersion: null,
    requests24h: 0,
    errorRate24h: null,
    revenue30d: 0,
    createdAt: at,
    updatedAt: at,
    description,
    inputs: modality === "text" ? ["text"] : ["text", "image"],
    outputs: [modality],
    tags: [],
    license: null,
    pausedReason: null,
    versionList: [
      {
        id: "v1",
        modelId: id,
        label: "1.0",
        status: "draft",
        isDefault: false,
        changelog: "",
        inputSchema: clone(EMPTY_INPUT),
        outputSchema: clone(outputFor(modality)),
        pricing: { unit: UNIT_FOR[modality], defaultTier: "standard", tiers: [{ id: "standard", label: "Standard", price: 0, cost: null }], input: null, promo: null },
        routing: { ...defaultRouting(modality), timeoutSeconds: 600 },
        routes: [],
        replacement: null,
        createdAt: at,
        createdBy,
        releasedAt: null,
        deprecatedAt: null,
        sunsetAt: null,
        requests24h: 0,
      },
    ],
  };
  store.models.push(model);
  audit(ctx, "model.create", "model", id, { name, modality, visibility });
  return modelView(store, model);
}

function updateModel(ctx: Context) {
  const model = findModel(ctx.store, ctx.params);
  const { body } = ctx;
  const before = clone(model);
  const name = text(body, "name", { max: 80 });
  if (name === "") invalid("name", "Enter a name.");
  if (name !== undefined) model.name = name;
  const description = text(body, "description", { max: 2000 });
  if (description !== undefined) model.description = description;
  const tasks = stringList(body, "tasks", 10);
  if (tasks) model.tasks = tasks;
  const visibility = oneOf(body, "visibility", VISIBILITIES);
  if (visibility) model.visibility = visibility;
  const featured = bool(body, "featured");
  if (featured !== undefined) model.featured = featured;
  const tags = stringList(body, "tags", 20);
  if (tags) model.tags = tags;
  if (has(body, "license")) model.license = text(body, "license", { max: 120 }) || null;
  for (const field of ["inputs", "outputs"] as const) {
    const media = stringList(body, field, 5);
    if (!media) continue;
    if (media.some((m) => !(MEDIA as readonly string[]).includes(m))) invalid(field, `Use ${MEDIA.join(", ")}.`);
    model[field] = media as Medium[];
  }
  const changed = changes(before, model, ["name", "description", "tasks", "visibility", "featured", "tags", "license", "inputs", "outputs"]);
  if (Object.keys(changed).length > 0) audit(ctx, "model.update", "model", model.id, changed);
  return done(ctx, model);
}

function pauseModel(ctx: Context) {
  const model = findModel(ctx.store, ctx.params);
  const why = reason(ctx.body);
  if (model.state === "paused") conflict("The model is already paused.");
  model.state = "paused";
  model.pausedReason = why;
  audit(ctx, "model.pause", "model", model.id, { reason: why });
  return done(ctx, model);
}

function resumeModel(ctx: Context) {
  const model = findModel(ctx.store, ctx.params);
  if (model.state !== "paused") conflict("The model isn't paused.");
  model.state = "active";
  const was = model.pausedReason;
  model.pausedReason = null;
  audit(ctx, "model.resume", "model", model.id, { pausedReason: was });
  return done(ctx, model);
}

// ---- Versions

function createVersion(ctx: Context) {
  const { store, body } = ctx;
  const model = findModel(store, ctx.params);
  const id = idField(body, "id", "version ID", ID_PATTERN);
  const label = text(body, "label", { max: 40, required: "Enter a label." });
  const changelog = text(body, "changelog", { max: 4000 }) ?? "";
  const fromId = text(body, "from", { max: 64 }) || undefined;
  const from = fromId ? (model.versionList.find((v) => v.id === fromId) ?? invalid("from", "No version with this ID.")) : null;
  if (model.versionList.some((v) => v.id === id)) conflict("This model already has a version with this ID.", { id: "This model already has a version with this ID." });
  const at = now();
  const version: ModelVersion = {
    id,
    modelId: model.id,
    label,
    status: "draft",
    isDefault: false,
    changelog,
    inputSchema: from ? clone(from.inputSchema) : clone(EMPTY_INPUT),
    outputSchema: from ? clone(from.outputSchema) : clone(outputFor(model.modality)),
    pricing: from
      ? clone(from.pricing)
      : { unit: UNIT_FOR[model.modality], defaultTier: "standard", tiers: [{ id: "standard", label: "Standard", price: 0, cost: null }], input: null, promo: null },
    routing: from ? clone(from.routing) : defaultRouting(model.modality),
    routes: (from?.routes ?? []).map((r) => ({
      ...clone(r),
      id: store.random.id("rt_", 8),
      health: { successRate: null, p50Ms: null, p95Ms: null, requests24h: 0 },
      updatedAt: at,
    })),
    replacement: null,
    createdAt: at,
    createdBy: actor(ctx).name,
    releasedAt: null,
    deprecatedAt: null,
    sunsetAt: null,
    requests24h: 0,
  };
  model.versionList.push(version);
  audit(ctx, "version.create", "version", `${model.id}@${id}`, { label, from: from?.id ?? null });
  return done(ctx, model);
}

function updateVersion(ctx: Context) {
  const { model, version, versionId } = target(ctx);
  const { body } = ctx;
  if (version.status === "retired") invalidState("Retired versions can't change.");
  const locked = (["inputSchema", "outputSchema", "pricing"] as const).filter((field) => has(body, field));
  if (locked.length > 0 && version.status !== "draft" && version.status !== "staging") {
    invalidState("Live versions can't change their schema or price. Create a new version.", "version_locked");
  }
  const before = clone(version);
  const label = text(body, "label", { max: 40 });
  if (label === "") invalid("label", "Enter a label.");
  if (label !== undefined) version.label = label;
  const changelog = text(body, "changelog", { max: 4000 });
  if (changelog !== undefined) version.changelog = changelog;
  if (has(body, "routing")) version.routing = within("routing", () => readRouting(nested(body, "routing"), version.routing));
  if (has(body, "inputSchema")) version.inputSchema = readSchema(body, "inputSchema");
  if (has(body, "outputSchema")) version.outputSchema = readSchema(body, "outputSchema");
  if (has(body, "pricing")) version.pricing = withTierCosts(within("pricing", () => readPricing(nested(body, "pricing"))), version.routes);
  const changed = changes(before, version, ["label", "changelog", "routing", "inputSchema", "outputSchema", "pricing"]);
  if (Object.keys(changed).length > 0) audit(ctx, "version.update", "version", versionId, changed);
  return done(ctx, model);
}

function promoteVersion(ctx: Context) {
  const { model, version, versionId } = target(ctx);
  const to = oneOf(ctx.body, "to", ["staging", "live"] as const, true);
  const from = version.status;
  if (from !== "draft" && from !== "staging") invalidState("Only draft and staging versions can be promoted.");
  if (from === to) invalidState(`The version is already ${to}.`);
  if (to === "live") {
    if (activeRoutes(version).length === 0) invalidState("Add an active route before going live.", "no_route");
    if (version.pricing.tiers.some((tier) => !(tier.price > 0))) invalidState("Every price tier needs a price above zero.", "no_price");
    version.releasedAt = now();
    if (model.defaultVersion === null) model.defaultVersion = version.id;
  }
  version.status = to;
  audit(ctx, "version.promote", "version", versionId, { from, to });
  return done(ctx, model);
}

function setDefault(ctx: Context) {
  const { model, version, versionId } = target(ctx);
  if (version.status !== "live") invalidState("Only live versions can be the default.");
  if (model.defaultVersion !== version.id) {
    const from = model.defaultVersion;
    model.defaultVersion = version.id;
    audit(ctx, "version.default", "version", versionId, { from, to: version.id });
  }
  return done(ctx, model);
}

function deprecateVersion(ctx: Context) {
  const { model, version, versionId } = target(ctx);
  const { body } = ctx;
  if (version.status !== "live") invalidState("Only live versions can be deprecated.");
  if (model.defaultVersion === version.id) invalidState("Make another version the default first.");
  const sunsetAt = futureDate(body, "sunsetAt", "Pick a sunset date in the future.");
  const replacement = body.replacement === null || body.replacement === undefined ? null : String(body.replacement);
  if (replacement !== null) {
    const next = model.versionList.find((v) => v.id === replacement);
    if (!next || next.id === version.id || next.status !== "live") invalid("replacement", "Pick another live version of this model, or none.");
  }
  version.status = "deprecated";
  version.deprecatedAt = now();
  version.sunsetAt = sunsetAt;
  version.replacement = replacement;
  audit(ctx, "version.deprecate", "version", versionId, { sunsetAt, replacement });
  return done(ctx, model);
}

function retireVersion(ctx: Context) {
  const { model, version, versionId } = target(ctx);
  if (version.status !== "deprecated") invalidState("Only deprecated versions can be retired.");
  version.status = "retired";
  audit(ctx, "version.retire", "version", versionId, { replacement: version.replacement });
  return done(ctx, model);
}

// ---- Routes

/** 422 when the version answers customers and would be left without an active route. */
function keepsActiveRoute(version: ModelVersion, without: Route) {
  if (answers(version) && without.status === "active" && activeRoutes(version).length === 1) {
    invalidState(`A ${version.status} version needs at least one active route. Add another before removing this one.`, "no_route");
  }
}

function readRoute(ctx: Context, version: ModelVersion, current: Route | null) {
  const { body, store } = ctx;
  const fields: Partial<Route> = {};
  if (!current) {
    const providerId = text(body, "providerId", { required: "Pick a provider." });
    if (!store.providers.some((p) => p.id === providerId)) invalid("providerId", "No provider with this ID.");
    fields.providerId = providerId;
  }
  const upstream = text(body, "upstreamModel", { max: 200, ...(current ? {} : { required: "Enter the provider's model ID." }) });
  if (upstream === "") invalid("upstreamModel", "Enter the provider's model ID.");
  if (upstream !== undefined) fields.upstreamModel = upstream;
  if (current) {
    const status = oneOf(body, "status", ROUTE_STATUSES);
    if (status) fields.status = status;
  }
  const priority = number(body, "priority", { min: 1, max: 100, integer: true });
  if (priority !== undefined) fields.priority = priority;
  const weight = number(body, "weight", { min: 0, max: 100, integer: true });
  if (weight !== undefined) fields.weight = weight;
  if (has(body, "cost") || !current) {
    const cost = within("cost", () => readUnitPrice(nested(body, "cost")));
    if (cost.unit !== version.pricing.unit) invalid("cost", `Use the version's billing unit (${version.pricing.unit}).`);
    fields.cost = cost;
  }
  const region = text(body, "region", { max: 50, ...(current ? {} : { required: "Enter a region." }) });
  if (region === "") invalid("region", "Enter a region.");
  if (region !== undefined) fields.region = region;
  const maxConcurrency = nullableNumber(body, "maxConcurrency", { min: 1, integer: true });
  if (maxConcurrency !== undefined) fields.maxConcurrency = maxConcurrency;
  return fields;
}

function addRoute(ctx: Context) {
  const { model, version, versionId } = target(ctx);
  if (version.status === "retired") invalidState("Retired versions can't take routes.");
  const fields = readRoute(ctx, version, null);
  const provider = ctx.store.providers.find((p) => p.id === fields.providerId);
  const created: Route = {
    id: ctx.store.random.id("rt_", 8),
    providerId: fields.providerId ?? "",
    providerName: provider?.name ?? "",
    upstreamModel: fields.upstreamModel ?? "",
    status: "active",
    priority: fields.priority ?? Math.max(0, ...version.routes.map((r) => r.priority)) + 1,
    weight: fields.weight ?? 0,
    cost: fields.cost ?? { unit: version.pricing.unit, price: 0 },
    region: fields.region ?? provider?.regions[0] ?? "",
    maxConcurrency: fields.maxConcurrency ?? null,
    health: { successRate: null, p50Ms: null, p95Ms: null, requests24h: 0 },
    updatedAt: now(),
  };
  version.routes.push(created);
  version.pricing = withTierCosts(version.pricing, version.routes);
  audit(ctx, "route.create", "route", `${versionId}/${created.id}`, { providerId: created.providerId, upstreamModel: created.upstreamModel, cost: created.cost });
  return done(ctx, model);
}

function updateRoute(ctx: Context) {
  const { model, version, versionId } = target(ctx);
  const current = findRoute(version, ctx.params.routeId);
  if (version.status === "retired") invalidState("Routes on retired versions can't change.");
  const fields = readRoute(ctx, version, current);
  if (fields.status && fields.status !== "active") keepsActiveRoute(version, current);
  const before = clone(current);
  Object.assign(current, fields);
  if (!sameJson(before, current)) {
    current.updatedAt = now();
    version.pricing = withTierCosts(version.pricing, version.routes);
    audit(ctx, "route.update", "route", `${versionId}/${current.id}`, changes(before, current, ["upstreamModel", "status", "priority", "weight", "cost", "region", "maxConcurrency"]));
  }
  return done(ctx, model);
}

function deleteRoute(ctx: Context) {
  const { model, version, versionId } = target(ctx);
  const current = findRoute(version, ctx.params.routeId);
  if (version.status === "retired") invalidState("Routes on retired versions can't change.");
  keepsActiveRoute(version, current);
  version.routes = version.routes.filter((r) => r.id !== current.id);
  version.pricing = withTierCosts(version.pricing, version.routes);
  audit(ctx, "route.delete", "route", `${versionId}/${current.id}`, { providerId: current.providerId, upstreamModel: current.upstreamModel });
  return done(ctx, model);
}

const MODEL = "/models/:publisher/:slug";
const VERSION = `${MODEL}/versions/:version`;

export const modelRoutes: RouteDef[] = [
  route("GET", "/models", "catalog.view", listModels),
  route("POST", "/models", "catalog.edit", createModel),
  route("GET", MODEL, "catalog.view", (ctx) => modelView(ctx.store, findModel(ctx.store, ctx.params))),
  route("PATCH", MODEL, "catalog.edit", updateModel),
  route("POST", `${MODEL}/pause`, "catalog.publish", pauseModel),
  route("POST", `${MODEL}/resume`, "catalog.publish", resumeModel),
  route("POST", `${MODEL}/versions`, "catalog.edit", createVersion),
  route("PATCH", VERSION, "catalog.edit", updateVersion),
  route("POST", `${VERSION}/promote`, "catalog.publish", promoteVersion),
  route("POST", `${VERSION}/default`, "catalog.publish", setDefault),
  route("POST", `${VERSION}/deprecate`, "catalog.publish", deprecateVersion),
  route("POST", `${VERSION}/retire`, "catalog.publish", retireVersion),
  route("POST", `${VERSION}/routes`, "catalog.edit", addRoute),
  route("PATCH", `${VERSION}/routes/:routeId`, "catalog.edit", updateRoute),
  route("DELETE", `${VERSION}/routes/:routeId`, "catalog.edit", deleteRoute),
];
