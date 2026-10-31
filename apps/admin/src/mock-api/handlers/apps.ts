import { APP_CATEGORIES, type AppStep } from "@modelvend/admin-api/apps";
import { audit, changes } from "../audit";
import { conflict, fail, invalid, invalidState, notFound } from "../http";
import { actor, route, type Context, type RouteDef } from "../router";
import type { AppRecord, ReleaseRecord, Store } from "../types";
import { clone } from "../util";
import { checkMargins } from "../margins";
import { EMPTY_INPUT } from "../seed/schemas";
import { checkNumber, has, idField, isObject, number, oneOf, readSchema, reason, stringList, text, within } from "../validate";
import { appSummary, appView, releaseView } from "../views";

const APP_SLUG = /^[a-z0-9][a-z0-9-]*$/;
const now = () => new Date().toISOString();

function findApp(store: Store, slug: string): AppRecord {
  return store.apps.find((a) => a.slug === slug) ?? notFound("app");
}

function findRelease(app: AppRecord, number: number): ReleaseRecord {
  return app.releases.find((r) => r.number === number) ?? notFound("release");
}

function done(ctx: Context, app: AppRecord) {
  app.updatedAt = now();
  return appView(ctx.store, app);
}

const PINNED = /^[a-z0-9][a-z0-9.-]*\/[a-z0-9][a-z0-9.-]*@[a-zA-Z0-9][a-zA-Z0-9.-]*$/;

function readSteps(store: Store, value: unknown): AppStep[] {
  if (!Array.isArray(value)) return invalid("steps", "Must be a list of steps.");
  const steps = value.map((step: unknown, index) =>
    within(`steps.${index}`, () => {
      if (!isObject(step)) return invalid("step", "Must be an object.");
      const ref = text(step, "model", { required: "Pick a model." });
      if (!PINNED.test(ref)) invalid("model", "Pin it as publisher/slug@version.");
      const [modelId, versionId] = ref.split("@");
      const model = store.models.find((m) => m.id === modelId) ?? invalid("model", "No model with this ID.");
      if (!model.versionList.some((v) => v.id === versionId)) invalid("model", `${modelId} has no version ${versionId}.`);
      if (step.input !== undefined && !isObject(step.input)) invalid("input", "Must be an object.");
      return {
        id: step.id === undefined || step.id === "" ? `step-${index + 1}` : idField(step, "id", "step ID"),
        stage: text(step, "stage", { max: 60 }) || null,
        model: ref,
        input: clone((step.input as Record<string, unknown> | undefined) ?? {}),
      };
    }),
  );
  if (new Set(steps.map((s) => s.id)).size !== steps.length) invalid("steps", "Give each step its own ID.");
  return steps;
}

/** Every `{{path}}` in a template, however deep. */
function references(value: unknown): string[] {
  if (typeof value === "string") return [...value.matchAll(/\{\{([^}]+)\}\}/g)].map((match) => match[1].trim());
  if (Array.isArray(value)) return value.flatMap(references);
  if (isObject(value)) return Object.values(value).flatMap(references);
  return [];
}

/** Why a template can't read `path` at this point, or null. The same rule as services/internal/apps. */
function unreadable(path: string, done: ReadonlySet<string>): string | null {
  const parts = path.split(".");
  if (parts[0] === "input" && parts.length > 1) return null;
  if (parts[0] === "steps" && parts.length > 2 && parts[2] === "output") {
    return done.has(parts[1]) ? null : `{{${path}}} reads step "${parts[1]}" before it runs.`;
  }
  return `{{${path}}} must start with input. or steps.<id>.output.`;
}

/** 422 `invalid_release` at the first thing wrong with a release's stages, templates or output map. */
function checkRelease(release: ReleaseRecord) {
  const refuse = (field: string, message: string) => fail(422, "invalid_release", message, { [field]: message });
  const done = new Set<string>();
  release.steps.forEach((step, index) => {
    if (step.stage !== null && !release.stages.includes(step.stage)) refuse(`steps.${index}.stage`, `"${step.stage}" isn't in the release's stages.`);
    for (const path of references(step.input)) {
      const problem = unreadable(path, done);
      if (problem) refuse(`steps.${index}.input`, problem);
    }
    done.add(step.id);
  });
  if (Object.keys(release.outputMap).length === 0) refuse("outputMap", "Say what the customer gets.");
  for (const path of references(release.outputMap)) {
    const problem = unreadable(path, done);
    if (problem) refuse("outputMap", problem);
  }
}

/** 422 naming the first step whose version can't serve: not live, or with `allowDeprecated`, not live or deprecated. */
function checkSteps(store: Store, steps: AppStep[], allowDeprecated: boolean) {
  steps.forEach((step, index) => {
    const [modelId, versionId] = step.model.split("@");
    const model = store.models.find((m) => m.id === modelId);
    const version = model?.versionList.find((v) => v.id === versionId);
    const status = version?.status ?? "missing";
    const ok = status === "live" || (allowDeprecated && status === "deprecated");
    if (!ok) {
      const message = `Step "${step.id}" uses ${step.model}, which is ${status === "missing" ? "gone" : status}, not live.`;
      fail(422, "version_not_live", message, { [`steps.${index}.model`]: message });
    }
  });
}

function createApp(ctx: Context) {
  const { store, body } = ctx;
  const slug = idField(body, "slug", "slug", APP_SLUG);
  const name = text(body, "name", { max: 80, required: "Enter a name." });
  const tagline = text(body, "tagline", { max: 120 }) ?? "";
  const category = oneOf(body, "category", APP_CATEGORIES, true);
  if (store.apps.some((a) => a.slug === slug)) conflict("An app with this slug already exists.", { slug: "An app with this slug already exists." });
  const at = now();
  const app: AppRecord = {
    slug,
    name,
    tagline,
    description: "",
    category,
    status: "draft",
    inputSchema: clone(EMPTY_INPUT),
    outputSchema: clone(EMPTY_INPUT),
    pausedReason: null,
    runs24h: 0,
    revenue30dMicros: 0,
    updatedAt: at,
    releases: [{ number: 1, status: "draft", steps: [], stages: [], outputMap: {}, priceMicros: 0, notes: "", createdAt: at, createdBy: actor(ctx).name, publishedAt: null }],
  };
  store.apps.push(app);
  audit(ctx, "app.create", "app", slug, { name, category });
  return appView(store, app);
}

function updateApp(ctx: Context) {
  const app = findApp(ctx.store, ctx.params.slug);
  const { body } = ctx;
  const name = text(body, "name", { max: 80 });
  if (name === "") invalid("name", "Enter a name.");
  const tagline = text(body, "tagline", { max: 120 });
  const description = text(body, "description", { max: 2000 });
  const category = oneOf(body, "category", APP_CATEGORIES);
  const inputSchema = has(body, "inputSchema") ? readSchema(body, "inputSchema") : undefined;
  const outputSchema = has(body, "outputSchema") ? readSchema(body, "outputSchema") : undefined;
  const before = clone(app);
  if (name !== undefined) app.name = name;
  if (tagline !== undefined) app.tagline = tagline;
  if (description !== undefined) app.description = description;
  if (category) app.category = category;
  if (inputSchema) app.inputSchema = inputSchema;
  if (outputSchema) app.outputSchema = outputSchema;
  const changed = changes(before, app, ["name", "tagline", "description", "category", "inputSchema", "outputSchema"]);
  if (Object.keys(changed).length > 0) audit(ctx, "app.update", "app", app.slug, changed);
  return done(ctx, app);
}

function createRelease(ctx: Context) {
  const app = findApp(ctx.store, ctx.params.slug);
  const draft = app.releases.find((r) => r.status === "draft");
  if (draft) conflict(`Release ${draft.number} is already a draft. Edit or publish it first.`);
  const live = app.releases.find((r) => r.status === "live");
  const release: ReleaseRecord = {
    number: Math.max(0, ...app.releases.map((r) => r.number)) + 1,
    status: "draft",
    steps: live ? clone(live.steps) : [],
    stages: live ? [...live.stages] : [],
    outputMap: live ? clone(live.outputMap) : {},
    priceMicros: live?.priceMicros ?? 0,
    notes: "",
    createdAt: now(),
    createdBy: actor(ctx).name,
    publishedAt: null,
  };
  app.releases.push(release);
  audit(ctx, "app.release.create", "app", app.slug, { release: release.number, from: live?.number ?? null });
  return done(ctx, app);
}

function updateRelease(ctx: Context) {
  const app = findApp(ctx.store, ctx.params.slug);
  const release = findRelease(app, Number(ctx.params.number));
  if (release.status !== "draft") invalidState("Only draft releases can change. Create a new release instead.");
  const { body } = ctx;
  // Everything is checked before anything changes, so a refused update leaves the draft as it was.
  const steps = has(body, "steps") ? readSteps(ctx.store, body.steps) : undefined;
  const stages = stringList(body, "stages", 20);
  if (has(body, "outputMap") && !isObject(body.outputMap)) invalid("outputMap", "Must be a JSON object.");
  const priceMicros = number(body, "priceMicros", { min: 0, integer: true });
  const notes = text(body, "notes", { max: 2000 });
  const before = clone(release);
  if (steps) release.steps = steps;
  if (stages) release.stages = stages;
  if (has(body, "outputMap")) release.outputMap = clone(body.outputMap as Record<string, unknown>);
  if (priceMicros !== undefined) release.priceMicros = priceMicros;
  if (notes !== undefined) release.notes = notes;
  const changed = changes(before, release, ["steps", "stages", "outputMap", "priceMicros", "notes"]);
  if (Object.keys(changed).length > 0) audit(ctx, "app.release.update", "app", app.slug, { release: release.number, ...changed });
  return done(ctx, app);
}

/**
 * Puts `release` live, superseding the live one. A draft app goes live with it; a paused app stays paused
 * (the kill switch is only lifted by resuming), so the release is what runs once it is resumed.
 */
function goLive(app: AppRecord, release: ReleaseRecord): number | null {
  const previous = app.releases.find((r) => r.status === "live") ?? null;
  if (previous) previous.status = "superseded";
  release.status = "live";
  release.publishedAt = now();
  if (app.status !== "paused") app.status = "live";
  return previous?.number ?? null;
}

function publishRelease(ctx: Context) {
  const app = findApp(ctx.store, ctx.params.slug);
  const release = findRelease(app, Number(ctx.params.number));
  if (release.status !== "draft") invalidState("Only draft releases can be published. Roll back to put an earlier release live again.");
  if (release.steps.length === 0) invalidState("Add at least one step before publishing.", "no_steps");
  checkRelease(release);
  checkSteps(ctx.store, release.steps, false);
  if (!(release.priceMicros > 0)) invalidState("Set a price per run before publishing.", "no_price");
  const why = text(ctx.body, "reason", { max: 500 }) || undefined;
  const { costMicros } = releaseView(ctx.store, release);
  checkMargins(ctx, [{ name: `Release #${release.number}`, price: release.priceMicros, cost: costMicros }], why);
  const previous = goLive(app, release);
  audit(ctx, "app.release.publish", "app", app.slug, { release: release.number, previous, priceMicros: release.priceMicros, paused: app.status === "paused", ...(why && { reason: why }) });
  return done(ctx, app);
}

function rollback(ctx: Context) {
  const app = findApp(ctx.store, ctx.params.slug);
  const number = checkNumber(ctx.body.release, "release", { min: 1, integer: true });
  const release = app.releases.find((r) => r.number === number) ?? invalid("release", "No release with this number.");
  if (release.status !== "superseded") invalidState("Only superseded releases can go live again.");
  // Deprecated versions still answer, so an emergency rollback may use them.
  checkSteps(ctx.store, release.steps, true);
  const previous = goLive(app, release);
  audit(ctx, "app.rollback", "app", app.slug, { from: previous, to: release.number, paused: app.status === "paused" });
  return done(ctx, app);
}

function pauseApp(ctx: Context) {
  const app = findApp(ctx.store, ctx.params.slug);
  const why = reason(ctx.body);
  if (app.status === "paused") conflict("The app is already paused.");
  if (app.status === "draft") invalidState("The app isn't live, so there is nothing to pause.");
  app.status = "paused";
  app.pausedReason = why;
  audit(ctx, "app.pause", "app", app.slug, { reason: why });
  return done(ctx, app);
}

function resumeApp(ctx: Context) {
  const app = findApp(ctx.store, ctx.params.slug);
  if (app.status !== "paused") conflict("The app isn't paused.");
  app.status = app.releases.some((r) => r.status === "live") ? "live" : "draft";
  app.pausedReason = null;
  audit(ctx, "app.resume", "app", app.slug);
  return done(ctx, app);
}

const APP = "/apps/:slug";

export const appRoutes: RouteDef[] = [
  route("GET", "/apps", "catalog.view", ({ store }) =>
    store.apps.map((app) => appSummary(store, app)).sort((a, b) => b.runs24h - a.runs24h || a.name.localeCompare(b.name)),
  ),
  route("POST", "/apps", "catalog.edit", createApp),
  route("GET", APP, "catalog.view", (ctx) => appView(ctx.store, findApp(ctx.store, ctx.params.slug))),
  route("PATCH", APP, "catalog.edit", updateApp),
  route("POST", `${APP}/releases`, "catalog.edit", createRelease),
  route("PATCH", `${APP}/releases/:number`, "catalog.edit", updateRelease),
  route("POST", `${APP}/releases/:number/publish`, "catalog.publish", publishRelease),
  route("POST", `${APP}/rollback`, "catalog.publish", rollback),
  route("POST", `${APP}/pause`, "catalog.publish", pauseApp),
  route("POST", `${APP}/resume`, "catalog.publish", resumeApp),
];
