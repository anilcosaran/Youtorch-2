import { APP_CATEGORIES, type AppStep } from "@modelvend/admin-api/apps";
import { audit, changes } from "../audit";
import { conflict, fail, invalid, invalidState, notFound } from "../http";
import { actor, route, type Context, type RouteDef } from "../router";
import type { AppRecord, ReleaseRecord, Store } from "../types";
import { clone } from "../util";
import { checkNumber, has, idField, isObject, number, oneOf, reason, text, within } from "../validate";
import { appSummary, appView } from "../views";

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

function readSteps(store: Store, value: unknown): AppStep[] {
  if (!Array.isArray(value)) return invalid("steps", "Must be a list of steps.");
  const steps = value.map((step: unknown, index) =>
    within(`steps.${index}`, () => {
      if (!isObject(step)) return invalid("step", "Must be an object.");
      const name = text(step, "name", { max: 60, required: "Name the step." });
      const modelId = text(step, "modelId", { required: "Pick a model." });
      const model = store.models.find((m) => m.id === modelId) ?? invalid("modelId", "No model with this ID.");
      const version = text(step, "version", { required: "Pick a version." });
      if (!model.versionList.some((v) => v.id === version)) invalid("version", `${modelId} has no version ${version}.`);
      if (step.params !== undefined && !isObject(step.params)) invalid("params", "Must be an object.");
      return {
        id: step.id === undefined || step.id === "" ? `step-${index + 1}` : idField(step, "id", "step ID"),
        name,
        modelId,
        version,
        params: clone((step.params as Record<string, unknown> | undefined) ?? {}),
      };
    }),
  );
  if (new Set(steps.map((s) => s.id)).size !== steps.length) invalid("steps", "Give each step its own ID.");
  return steps;
}

/** 422 naming the first step whose version can't serve: not live, or with `allowDeprecated`, not live or deprecated. */
function checkSteps(store: Store, steps: AppStep[], allowDeprecated: boolean) {
  steps.forEach((step, index) => {
    const model = store.models.find((m) => m.id === step.modelId);
    const version = model?.versionList.find((v) => v.id === step.version);
    const status = version?.status ?? "missing";
    const ok = status === "live" || (allowDeprecated && status === "deprecated");
    if (!ok) {
      const message = `Step "${step.name}" uses ${step.modelId}@${step.version}, which is ${status === "missing" ? "gone" : status}, not live.`;
      fail(422, "version_not_live", message, { [`steps.${index}.version`]: message });
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
    pausedReason: null,
    runs24h: 0,
    revenue30d: 0,
    updatedAt: at,
    releases: [{ number: 1, status: "draft", steps: [], price: 0, notes: "", createdAt: at, createdBy: actor(ctx).name, publishedAt: null }],
  };
  store.apps.push(app);
  audit(ctx, "app.create", "app", slug, { name, category });
  return appView(store, app);
}

function updateApp(ctx: Context) {
  const app = findApp(ctx.store, ctx.params.slug);
  const { body } = ctx;
  const before = clone(app);
  const name = text(body, "name", { max: 80 });
  if (name === "") invalid("name", "Enter a name.");
  if (name !== undefined) app.name = name;
  const tagline = text(body, "tagline", { max: 120 });
  if (tagline !== undefined) app.tagline = tagline;
  const description = text(body, "description", { max: 2000 });
  if (description !== undefined) app.description = description;
  const category = oneOf(body, "category", APP_CATEGORIES);
  if (category) app.category = category;
  const changed = changes(before, app, ["name", "tagline", "description", "category"]);
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
    price: live?.price ?? 0,
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
  const before = clone(release);
  if (has(body, "steps")) release.steps = readSteps(ctx.store, body.steps);
  const price = number(body, "price", { min: 0 });
  if (price !== undefined) release.price = price;
  const notes = text(body, "notes", { max: 2000 });
  if (notes !== undefined) release.notes = notes;
  const changed = changes(before, release, ["steps", "price", "notes"]);
  if (Object.keys(changed).length > 0) audit(ctx, "app.release.update", "app", app.slug, { release: release.number, ...changed });
  return done(ctx, app);
}

/** Puts `release` live, superseding the live one; the app goes live too. */
function goLive(app: AppRecord, release: ReleaseRecord): number | null {
  const previous = app.releases.find((r) => r.status === "live") ?? null;
  if (previous) previous.status = "superseded";
  release.status = "live";
  release.publishedAt = now();
  app.status = "live";
  app.pausedReason = null;
  return previous?.number ?? null;
}

function publishRelease(ctx: Context) {
  const app = findApp(ctx.store, ctx.params.slug);
  const release = findRelease(app, Number(ctx.params.number));
  if (release.status !== "draft") invalidState("Only draft releases can be published. Roll back to put an earlier release live again.");
  if (release.steps.length === 0) invalidState("Add at least one step before publishing.", "no_steps");
  checkSteps(ctx.store, release.steps, false);
  if (!(release.price > 0)) invalidState("Set a price per run before publishing.", "no_price");
  const previous = goLive(app, release);
  audit(ctx, "app.release.publish", "app", app.slug, { release: release.number, previous, price: release.price });
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
  audit(ctx, "app.rollback", "app", app.slug, { from: previous, to: release.number });
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
