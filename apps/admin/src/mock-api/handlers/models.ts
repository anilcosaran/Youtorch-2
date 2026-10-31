import {
  BILLING_UNITS,
  DISCLOSURES,
  MODALITIES,
  ROUTE_STATUSES,
  ROUTING_STRATEGIES,
  VISIBILITIES,
  type GalleryItem,
  type InputPrice,
  type MaxOutput,
  type Medium,
  type Modality,
  type ModelVersion,
  type Pricing,
  type Route,
  type RouteStatus,
  type RoutingPolicy,
  type TierCosts,
} from "@modelvend/admin-api/models";
import { describeSchemaProblem, schemaProblem } from "@/lib/catalog";
import { can } from "@/lib/permissions";
import { matchesQuery } from "@/lib/search";
import { audit, changes } from "../audit";
import { UNIT_FOR, activeRoutes, answers, defaultRouting, listNames, pricingProblem, usableRoutes, withTierCosts } from "../catalog";
import { conflict, fail, forbidden, invalid, invalidState, notFound, paginate } from "../http";
import { checkMargins } from "../margins";
import { actor, route, type Context, type RouteDef } from "../router";
import { EMPTY_INPUT, outputFor } from "../seed/schemas";
import type { ModelRecord, Store } from "../types";
import { clone, sameJson } from "../util";
import {
  ID_PATTERN,
  bool,
  checkDecimal,
  futureDate,
  has,
  idField,
  isObject,
  nested,
  nullableNumber,
  number,
  oneOf,
  readSchema,
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
  model.revision += 1;
  return modelView(ctx.store, model);
}

/** 409 `stale` when the model changed since the revision this edit was based on. */
function checkRevision(ctx: Context, model: ModelRecord) {
  const sent = ctx.request.headers.get("if-match");
  if (sent === null) invalid("If-Match", "Send the model's revision.");
  if (sent !== String(model.revision)) {
    fail(409, "stale", `${model.name} changed while you were editing it. Reload to see the latest, then try again.`);
  }
}

function readInputPrice(value: Body): InputPrice {
  return {
    unit: oneOf(value, "unit", BILLING_UNITS, true),
    price: checkDecimal(value.price, "price"),
    field: text(value, "field", { max: 64, required: "Name the input field that holds the media." }),
  };
}

function readTierValues(value: unknown): Record<string, string> {
  if (value === undefined || value === null) return {};
  if (!isObject(value) || Object.values(value).some((tier) => typeof tier !== "string")) return invalid("tierValues", "Map each value to a tier ID.");
  return clone(value) as Record<string, string>;
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
        price: checkDecimal(tier.price, "price"),
        cost: null,
      };
    }),
  );
  if (new Set(tiers.map((t) => t.id)).size !== tiers.length) invalid("tiers", "Give each tier its own ID.");
  const defaultTier = text(value, "defaultTier", { required: "Pick the default tier." });
  if (!tiers.some((t) => t.id === defaultTier)) invalid("defaultTier", "Pick one of the tiers.");
  const tierField = text(value, "tierField", { max: 64 }) || null;
  const tierValues = readTierValues(value.tierValues);
  const input = value.input === null || value.input === undefined ? null : within("input", () => readInputPrice(nested(value, "input")));
  const promo = nullableNumber(value, "promo", { min: 0, max: 0.99 }) ?? null;
  return { unit, defaultTier, tierField, tierValues, tiers, input, promo };
}

function readRouting(value: Body, current: RoutingPolicy): RoutingPolicy {
  return {
    strategy: oneOf(value, "strategy", ROUTING_STRATEGIES) ?? current.strategy,
    fallbacks: bool(value, "fallbacks") ?? current.fallbacks,
    maxAttempts: number(value, "maxAttempts", { min: 1, max: 5, integer: true }) ?? current.maxAttempts,
    timeoutSeconds: number(value, "timeoutSeconds", { min: 5, max: 3600, integer: true }) ?? current.timeoutSeconds,
  };
}

const SCHEMA_NAMES = { inputSchema: "input", outputSchema: "output" } as const;

/** 422 `invalid_schema` when either schema isn't usable, for versions copied or saved before it was checked. */
function checkSchemas(version: ModelVersion) {
  for (const field of ["inputSchema", "outputSchema"] as const) {
    const problem = schemaProblem(version[field]);
    if (!problem) continue;
    const message = `Fix the ${SCHEMA_NAMES[field]} schema first. ${describeSchemaProblem(problem)}`;
    fail(422, "invalid_schema", message, { [problem.path ? `${field}.${problem.path}` : field]: describeSchemaProblem(problem) });
  }
}

const emptyPricing = (modality: Modality): Pricing => ({
  unit: UNIT_FOR[modality],
  defaultTier: "standard",
  tierField: null,
  tierValues: {},
  tiers: [{ id: "standard", label: "Standard", price: "0", cost: null }],
  input: null,
  promo: null,
});

const VISIBILITY_RANK = { private: 0, unlisted: 1, public: 2 } as const;

function readMaxOutput(value: unknown): MaxOutput | null {
  if (value === null) return null;
  if (!isObject(value)) return invalid("maxOutput", "Must be an object.");
  return within("maxOutput", () => {
    const output: MaxOutput = {};
    for (const field of ["width", "height", "seconds"] as const) {
      const size = number(value, field, { above: 0 });
      if (size !== undefined) output[field] = size;
    }
    return output;
  });
}

function readGallery(value: unknown): GalleryItem[] {
  if (!Array.isArray(value)) return invalid("gallery", "Must be a list.");
  return value.map((item: unknown, index) =>
    within(`gallery.${index}`, () => {
      if (!isObject(item)) return invalid("item", "Must be an object.");
      return {
        url: text(item, "url", { max: 500, required: "Enter a URL." }),
        kind: oneOf(item, "kind", ["image", "video", "audio"] as const, true),
        caption: text(item, "caption", { max: 200 }) ?? "",
      };
    }),
  );
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
    .sort((a, b) => b.tasks24h - a.tasks24h || a.name.localeCompare(b.name));
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
  const visibility = oneOf(body, "visibility", VISIBILITIES) ?? "private";
  const disclosure = oneOf(body, "disclosure", DISCLOSURES) ?? "open";
  const author = text(body, "author", { max: 80 }) ?? publisher;
  if (visibility !== "private" && !can(actor(ctx), "catalog.publish")) {
    forbidden(`Starting a model ${visibility} needs the Publish permission (catalog.publish).`);
  }
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
    disclosure,
    author,
    featured: false,
    defaultVersion: null,
    tasks24h: 0,
    errorRate24h: null,
    revenue30dMicros: 0,
    revision: 1,
    createdAt: at,
    updatedAt: at,
    description,
    inputs: modality === "text" ? ["text"] : ["text", "image"],
    outputs: [modality],
    tags: [],
    license: null,
    capabilities: [],
    maxOutput: null,
    gallery: [],
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
        pricing: emptyPricing(modality),
        routing: { ...defaultRouting(modality), timeoutSeconds: 600 },
        routes: [],
        replacement: null,
        createdAt: at,
        createdBy,
        releasedAt: null,
        deprecatedAt: null,
        sunsetAt: null,
        tasks24h: 0,
      },
    ],
  };
  store.models.push(model);
  audit(ctx, "model.create", "model", id, { name, modality, visibility });
  return modelView(store, model);
}

/** Every field is read and checked before anything changes, so a refused update leaves the model as it was. */
function updateModel(ctx: Context) {
  const model = findModel(ctx.store, ctx.params);
  const { body } = ctx;
  checkRevision(ctx, model);
  const next: Partial<ModelRecord> = {};
  const name = text(body, "name", { max: 80 });
  if (name === "") invalid("name", "Enter a name.");
  if (name !== undefined) next.name = name;
  const description = text(body, "description", { max: 2000 });
  if (description !== undefined) next.description = description;
  const tasks = stringList(body, "tasks", 10);
  if (tasks) next.tasks = tasks;
  const visibility = oneOf(body, "visibility", VISIBILITIES);
  if (visibility) next.visibility = visibility;
  const disclosure = oneOf(body, "disclosure", DISCLOSURES);
  if (disclosure) next.disclosure = disclosure;
  const author = text(body, "author", { max: 80 });
  if (author) next.author = author;
  const capabilities = stringList(body, "capabilities", 30);
  if (capabilities) next.capabilities = capabilities;
  if (has(body, "maxOutput")) next.maxOutput = readMaxOutput(body.maxOutput);
  if (has(body, "gallery")) next.gallery = readGallery(body.gallery);
  const featured = bool(body, "featured");
  if (featured !== undefined) next.featured = featured;
  const tags = stringList(body, "tags", 20);
  if (tags) next.tags = tags;
  if (has(body, "license")) next.license = text(body, "license", { max: 120 }) || null;
  for (const field of ["inputs", "outputs"] as const) {
    const media = stringList(body, field, 5);
    if (!media) continue;
    if (media.some((m) => !(MEDIA as readonly string[]).includes(m))) invalid(field, `Use ${MEDIA.join(", ")}.`);
    next[field] = media as Medium[];
  }
  if (disclosure && disclosure !== model.disclosure) {
    if (!can(actor(ctx), "catalog.publish")) forbidden(`Changing how ${model.name} is disclosed needs the Publish permission (catalog.publish).`);
    // The router skips routes whose provider doesn't allow white label, so this could leave nothing to run on.
    const stranded = model.versionList.filter(answers).find((v) => usableRoutes(v, ctx.store.providers, disclosure).length === 0 && usableRoutes(v, ctx.store.providers, "open").length > 0);
    if (stranded) invalidState(`No provider on ${stranded.id}'s routes allows white label, so every task would fail.`, "white_label_not_allowed");
  }
  // Showing a model to more customers is a release decision, like putting a version live.
  if (visibility && VISIBILITY_RANK[visibility] > VISIBILITY_RANK[model.visibility] && !can(actor(ctx), "catalog.publish")) {
    forbidden(`Making ${model.name} ${visibility} needs the Publish permission (catalog.publish).`);
  }
  const before = clone(model);
  Object.assign(model, next);
  const changed = changes(before, model, ["name", "description", "tasks", "visibility", "disclosure", "author", "featured", "tags", "license", "inputs", "outputs", "capabilities", "maxOutput", "gallery"]);
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
      : emptyPricing(model.modality),
    routing: from ? clone(from.routing) : defaultRouting(model.modality),
    routes: (from?.routes ?? []).map((r) => ({
      ...clone(r),
      id: store.random.id("rt_", 8),
      health: { successRate: null, p50Ms: null, p95Ms: null, tasks24h: 0 },
      updatedAt: at,
    })),
    replacement: null,
    createdAt: at,
    createdBy: actor(ctx).name,
    releasedAt: null,
    deprecatedAt: null,
    sunsetAt: null,
    tasks24h: 0,
  };
  model.versionList.push(version);
  audit(ctx, "version.create", "version", `${model.id}@${id}`, { label, from: from?.id ?? null });
  return done(ctx, model);
}

/** Every field is read and checked before anything changes, so a refused update leaves the version as it was. */
function updateVersion(ctx: Context) {
  const { model, version, versionId } = target(ctx);
  const { body } = ctx;
  checkRevision(ctx, model);
  if (version.status === "retired") invalidState("Retired versions can't change.");
  const locked = (["inputSchema", "outputSchema", "pricing"] as const).filter((field) => has(body, field));
  if (locked.length > 0 && version.status !== "draft") {
    invalidState("Only drafts can change their schema or price. Create a new version.", "version_locked");
  }
  if (has(body, "pricing") && !can(actor(ctx), "pricing.edit")) forbidden("Setting prices needs the Set prices permission (pricing.edit).");
  const next: Partial<ModelVersion> = {};
  const label = text(body, "label", { max: 40 });
  if (label === "") invalid("label", "Enter a label.");
  if (label !== undefined) next.label = label;
  const changelog = text(body, "changelog", { max: 4000 });
  if (changelog !== undefined) next.changelog = changelog;
  if (has(body, "routing")) next.routing = within("routing", () => readRouting(nested(body, "routing"), version.routing));
  if (has(body, "inputSchema")) next.inputSchema = readSchema(body, "inputSchema");
  if (has(body, "outputSchema")) next.outputSchema = readSchema(body, "outputSchema");
  if (has(body, "pricing")) {
    const pricing = within("pricing", () => readPricing(nested(body, "pricing")));
    next.pricing = pricing;
  }
  const before = clone(version);
  Object.assign(version, next);
  if (next.pricing) {
    // A route's costs are per billing unit, so a new unit makes their numbers mean something else. A tier that is
    // gone takes its cost with it, so bringing back the ID doesn't bring back an old number.
    const tiers = next.pricing.tiers.map((tier) => tier.id);
    version.routes.forEach((route) => {
      const kept = next.pricing?.unit === before.pricing.unit ? Object.entries(route.tierCosts).filter(([tier]) => tiers.includes(tier)) : [];
      route.tierCosts = Object.fromEntries(kept);
    });
    version.pricing = withTierCosts(next.pricing, version.routes);
  }
  const changed = changes(before, version, ["label", "changelog", "routing", "inputSchema", "outputSchema", "pricing"]);
  if (Object.keys(changed).length > 0) audit(ctx, "version.update", "version", versionId, changed);
  return done(ctx, model);
}

/** The checks a draft passes to go live, in the order the contract lists them. */
function checkPublishable(ctx: Context, model: ModelRecord, version: ModelVersion, why: string | undefined) {
  checkSchemas(version);
  const problem = pricingProblem(version);
  if (problem) fail(422, "invalid_pricing", problem.message, { [problem.field]: problem.message });
  const usable = usableRoutes(version, ctx.store.providers, "open");
  if (usable.length === 0) invalidState("Add an active route on an active provider before going live.", "no_route");
  const allowed = usableRoutes(version, ctx.store.providers, model.disclosure);
  if (allowed.length === 0) {
    invalidState(`${model.name} is white label, and no provider on its routes allows that.`, "white_label_not_allowed");
  }
  if (version.pricing.tiers.some((tier) => !(Number(tier.price) > 0))) invalidState("Every price tier needs a price above zero.", "no_price");
  for (const route of allowed) {
    const missing = version.pricing.tiers.filter((tier) => route.tierCosts[tier.id] === undefined);
    if (missing.length > 0) {
      invalidState(`The ${route.providerName || route.providerId} route has no cost for ${listNames(missing.map((tier) => tier.id))}.`, "no_cost");
    }
  }
  // The route a task falls back to may cost more than the first, so each tier is held to its costliest route.
  const promo = 1 - (version.pricing.promo ?? 0);
  checkMargins(
    ctx,
    version.pricing.tiers.map((tier) => ({
      name: `The ${tier.id} tier`,
      price: Number(tier.price) * promo,
      cost: Math.max(...allowed.map((route) => Number(route.tierCosts[tier.id]))),
    })),
    why,
  );
}

function publishVersion(ctx: Context) {
  const { model, version, versionId } = target(ctx);
  if (version.status !== "draft") invalidState("Only drafts can go live.");
  const why = text(ctx.body, "reason", { max: 500 }) || undefined;
  checkPublishable(ctx, model, version, why);
  version.releasedAt = now();
  version.status = "live";
  if (model.defaultVersion === null) model.defaultVersion = version.id;
  audit(ctx, "version.publish", "version", versionId, why ? { reason: why } : {});
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

/**
 * Retiring can't be undone, so it waits until nothing still counts on the version: its sunset date has passed,
 * no live app release pins it, and no other deprecated version sends its callers to it.
 */
function retireVersion(ctx: Context) {
  const { model, version, versionId } = target(ctx);
  if (version.status !== "deprecated") invalidState("Only deprecated versions can be retired.");
  if (version.sunsetAt !== null && Date.parse(version.sunsetAt) > Date.now()) {
    invalidState(
      `${version.id} keeps answering until its sunset date, ${version.sunsetAt.slice(0, 10)}, as callers were told. Retire it after that.`,
      "before_sunset",
    );
  }
  const pinning = ctx.store.apps.filter((app) =>
    app.releases.some((release) => release.status === "live" && release.steps.some((step) => step.model === versionId)),
  );
  if (pinning.length > 0) {
    invalidState(
      `The live ${pinning.length === 1 ? "release" : "releases"} of ${listNames(pinning.map((app) => app.name))} ${pinning.length === 1 ? "pins" : "pin"} ${version.id}. ` +
        "Deploy a release that uses another version first.",
      "pinned_by_app",
    );
  }
  if (model.defaultVersion === version.id && model.versionList.some((v) => v.status === "live")) {
    invalidState(`${version.id} is the default. Make a live version the default first.`, "is_default");
  }
  const forwarding = model.versionList.filter((v) => v.id !== version.id && v.status === "deprecated" && v.replacement === version.id);
  if (forwarding.length > 0) {
    const ids = listNames(forwarding.map((v) => v.id));
    invalidState(
      `${ids} ${forwarding.length === 1 ? "is" : "are"} deprecated with ${version.id} as the replacement, so ${forwarding.length === 1 ? "its" : "their"} callers would be pointed at a retired version. Retire ${ids} first.`,
      "is_replacement",
    );
  }
  version.status = "retired";
  audit(ctx, "version.retire", "version", versionId, { replacement: version.replacement });
  return done(ctx, model);
}

// ---- Routes

/**
 * 422 when the version answers customers and would be left without an active route. The last route of a deprecated
 * version with a sunset date may drain; otherwise pausing the model is the way to stop it.
 */
function keepsActiveRoute(version: ModelVersion, without: Route, next?: RouteStatus) {
  if (!answers(version) || without.status !== "active" || activeRoutes(version).length > 1) return;
  if (next === "draining" && version.status === "deprecated" && version.sunsetAt !== null) return;
  invalidState(`A ${version.status} version needs at least one active route. Add another first, or pause the model to stop it.`, "no_route");
}

/** Costs are in the version's billing unit, per tier it has. A version that answers customers needs all of them. */
function readTierCosts(version: ModelVersion, value: unknown): TierCosts {
  if (!isObject(value)) return invalid("tierCosts", "Enter the cost per tier.");
  const costs: TierCosts = {};
  for (const [tier, cost] of Object.entries(value)) {
    if (!version.pricing.tiers.some((t) => t.id === tier)) invalid(`tierCosts.${tier}`, "This version has no such tier.");
    costs[tier] = checkDecimal(cost, `tierCosts.${tier}`);
  }
  if (answers(version)) {
    for (const tier of version.pricing.tiers) {
      if (costs[tier.id] === undefined) invalid(`tierCosts.${tier.id}`, "Enter the cost for this tier.");
    }
  }
  return costs;
}

/** Opening a route to customers is a release decision, like publishing a version. */
function checkOpensRoute(ctx: Context, version: ModelVersion) {
  if (answers(version) && !can(actor(ctx), "catalog.publish")) {
    forbidden(`A route on a ${version.status} version needs the Publish permission (catalog.publish).`);
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
  if (has(body, "tierCosts") || !current) fields.tierCosts = readTierCosts(version, body.tierCosts);
  const region = text(body, "region", { max: 50 });
  if (region === "") invalid("region", "Enter a region.");
  if (region !== undefined) fields.region = region;
  const maxConcurrency = nullableNumber(body, "maxConcurrency", { min: 1, integer: true });
  if (maxConcurrency !== undefined) fields.maxConcurrency = maxConcurrency;
  if (has(body, "mapping")) {
    if (body.mapping !== null && !isObject(body.mapping)) invalid("mapping", "Must be a JSON object, or null.");
    fields.mapping = body.mapping === null ? null : clone(body.mapping as Record<string, unknown>);
  }
  if (has(body, "transform")) fields.transform = text(body, "transform", { max: 100 }) || null;
  return fields;
}

function addRoute(ctx: Context) {
  const { model, version, versionId } = target(ctx);
  checkRevision(ctx, model);
  if (version.status === "retired") invalidState("Retired versions can't take routes.");
  checkOpensRoute(ctx, version);
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
    tierCosts: fields.tierCosts ?? {},
    region: fields.region ?? provider?.regions[0] ?? "",
    maxConcurrency: fields.maxConcurrency ?? null,
    mapping: fields.mapping ?? null,
    transform: fields.transform ?? null,
    health: { successRate: null, p50Ms: null, p95Ms: null, tasks24h: 0 },
    updatedAt: now(),
  };
  version.routes.push(created);
  version.pricing = withTierCosts(version.pricing, version.routes);
  audit(ctx, "route.create", "route", `${versionId}/${created.id}`, { providerId: created.providerId, upstreamModel: created.upstreamModel, tierCosts: created.tierCosts });
  return done(ctx, model);
}

function updateRoute(ctx: Context) {
  const { model, version, versionId } = target(ctx);
  const current = findRoute(version, ctx.params.routeId);
  checkRevision(ctx, model);
  if (version.status === "retired") invalidState("Routes on retired versions can't change.");
  const fields = readRoute(ctx, version, current);
  if (fields.status && fields.status !== "active") keepsActiveRoute(version, current, fields.status);
  if (fields.status === "active" && current.status !== "active") checkOpensRoute(ctx, version);
  const before = clone(current);
  Object.assign(current, fields);
  if (!sameJson(before, current)) {
    current.updatedAt = now();
    version.pricing = withTierCosts(version.pricing, version.routes);
    audit(ctx, "route.update", "route", `${versionId}/${current.id}`, changes(before, current, ["upstreamModel", "status", "priority", "weight", "tierCosts", "region", "maxConcurrency", "mapping", "transform"]));
  }
  return done(ctx, model);
}

function deleteRoute(ctx: Context) {
  const { model, version, versionId } = target(ctx);
  const current = findRoute(version, ctx.params.routeId);
  checkRevision(ctx, model);
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
  route("POST", `${VERSION}/publish`, "catalog.publish", publishVersion),
  route("POST", `${VERSION}/default`, "catalog.publish", setDefault),
  route("POST", `${VERSION}/deprecate`, "catalog.publish", deprecateVersion),
  route("POST", `${VERSION}/retire`, "catalog.publish", retireVersion),
  route("POST", `${VERSION}/routes`, "catalog.edit", addRoute),
  route("PATCH", `${VERSION}/routes/:routeId`, "catalog.edit", updateRoute),
  route("DELETE", `${VERSION}/routes/:routeId`, "catalog.edit", deleteRoute),
];
