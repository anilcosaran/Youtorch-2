import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import type { ApiKeyRow } from "@modelvend/admin-api/api-keys";
import type { App } from "@modelvend/admin-api/apps";
import type { AuditEntry } from "@modelvend/admin-api/audit";
import type { Permission } from "@modelvend/admin-api/auth";
import type { Page } from "@modelvend/admin-api/client";
import type { Customer, CustomerRow } from "@modelvend/admin-api/customers";
import type { Model, ModelVersion } from "@modelvend/admin-api/models";
import type { Provider } from "@modelvend/admin-api/providers";
import type { TaskDetail, TaskRow } from "@modelvend/admin-api/tasks";
import { handleMock, mockSettings } from ".";
import { resetStore } from "./store";
import type { Store } from "./types";

/*
 * The rules the mock enforces for the catalog, apps, customers and the audit
 * log. The Go admin API is tested against the same behaviour.
 */

interface ErrorBody {
  error: { code: string; message: string; fields?: Record<string, string> };
}

/** A browser with its own cookies; a new one is the seeded admin in development. */
class Browser {
  readonly jar = new Map<string, string>();

  async call<T = ErrorBody>(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<{ status: number; body: T }> {
    const url = `http://localhost/api/admin/v1${path}`;
    const headers = new Headers(extra);
    if (this.jar.size > 0) headers.set("cookie", [...this.jar].map(([name, value]) => `${name}=${value}`).join("; "));
    if (method !== "GET") headers.set("content-type", "application/json");
    const request = new NextRequest(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const response = await handleMock(request, new URL(url).pathname.replace(/^\/api/, ""));
    for (const cookie of response.headers.getSetCookie()) {
      const [pair, ...attributes] = cookie.split(";");
      const at = pair.indexOf("=");
      const name = pair.slice(0, at);
      if (attributes.some((a) => a.trim().toLowerCase() === "max-age=0")) this.jar.delete(name);
      else this.jar.set(name, pair.slice(at + 1));
    }
    const text = await response.text();
    return { status: response.status, body: (text ? JSON.parse(text) : undefined) as T };
  }

  /** An edit based on the model as it is now, sent with its revision. */
  async edit<T = Model>(method: string, modelPath: string, path: string, body?: unknown): Promise<{ status: number; body: T }> {
    const model = await this.call<Model>("GET", modelPath);
    return this.call<T>(method, `${modelPath}${path}`, body, { "If-Match": String(model.body.revision) });
  }
}

let store: Store;
let admin: Browser;

beforeEach(() => {
  mockSettings.latencyMs = [0, 0];
  store = resetStore();
  admin = new Browser();
});

/** Signs in as a new operator holding exactly these permissions. */
async function signedInWith(permissions: Permission[]): Promise<Browser> {
  const email = `${permissions.join("-").replaceAll(".", "_")}@modelvend.ai`;
  const password = "a-strong-password-1";
  expect((await admin.call("POST", "/operators", { email, name: "Test", role: "custom", permissions, password })).status).toBe(200);
  const browser = new Browser();
  expect((await browser.call("POST", "/auth/login", { email, password })).status).toBe(200);
  return browser;
}

const versionOf = (model: Model, id: string) => model.versionList.find((v) => v.id === id) as ModelVersion;
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const inWeeks = (weeks: number) => new Date(Date.now() + weeks * 7 * 86_400_000).toISOString();
const VEO = "/models/google/veo-3.1";
const SORA = "/models/openai/sora-2";

/** The stored record of a seeded version, to set up what the API wouldn't. */
function stored(modelId: string, versionId: string) {
  const version = store.models.find((m) => m.id === modelId)?.versionList.find((v) => v.id === versionId);
  if (!version) throw new Error("seed changed");
  return version;
}

/** A draft copied from Veo v2, so it has its routes, schemas and prices. */
async function draftOfVeo(id = "v3"): Promise<ModelVersion> {
  const created = await admin.call<Model>("POST", `${VEO}/versions`, { id, label: "3.2", from: "v2" });
  expect(created.status).toBe(200);
  return versionOf(created.body, id);
}

/** Sets every route's costs to `share` of each tier's price, promo included, so margins are known. */
function setCosts(modelId: string, versionId: string, share: number) {
  const version = stored(modelId, versionId);
  const promo = 1 - (version.pricing.promo ?? 0);
  for (const route of version.routes) {
    route.tierCosts = Object.fromEntries(version.pricing.tiers.map((tier) => [tier.id, String(Number(tier.price) * promo * share)]));
  }
}

describe("billing units", () => {
  it("clears route costs when a draft's unit changes, and asks for them again", async () => {
    const draft = await draftOfVeo();
    const { tiers, unit, defaultTier, tierField, tierValues, input, promo } = draft.pricing;
    expect(unit).toBe("second");
    const pricing = { unit: "minute", defaultTier, tierField, tierValues, input, promo, tiers: tiers.map(({ id, label, price }) => ({ id, label, price })) };

    const changed = await admin.edit("PATCH", VEO, "/versions/v3", { pricing });
    expect(changed.status).toBe(200);
    const moved = versionOf(changed.body, "v3");
    expect(moved.pricing.unit).toBe("minute");
    expect(moved.routes.every((route) => Object.keys(route.tierCosts).length === 0)).toBe(true);
    // Unknown, rather than a per-second number read per minute.
    expect(moved.pricing.tiers.every((tier) => tier.cost === null)).toBe(true);

    const refused = await admin.call("POST", `${VEO}/versions/v3/publish`, {});
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe("no_cost");

    for (const route of moved.routes) {
      const costs = Object.fromEntries(tiers.map((tier) => [tier.id, "0.001"]));
      expect((await admin.edit("PATCH", VEO, `/versions/v3/routes/${route.id}`, { tierCosts: costs })).status).toBe(200);
    }
    expect((await admin.call("POST", `${VEO}/versions/v3/publish`, {})).status).toBe(200);
  });

  it("keeps tiers' costs apart, so margins differ by tier", async () => {
    const draft = await draftOfVeo();
    const [route] = draft.routes;
    const [first, second] = draft.pricing.tiers;
    const changed = await admin.edit("PATCH", VEO, `/versions/v3/routes/${route.id}`, { tierCosts: { [first.id]: "0.01", [second.id]: "0.02" } });
    expect(changed.status).toBe(200);
    const tiers = versionOf(changed.body, "v3").pricing.tiers;
    expect(tiers.find((tier) => tier.id === first.id)?.cost).toBe("0.01");
    expect(tiers.find((tier) => tier.id === second.id)?.cost).toBe("0.02");
  });

  it("needs a cost per tier once the version answers customers", async () => {
    const live = versionOf((await admin.call<Model>("GET", VEO)).body, "v2");
    const route = live.routes[0];
    const [first] = live.pricing.tiers;
    const refused = await admin.edit<ErrorBody>("PATCH", VEO, `/versions/v2/routes/${route.id}`, { tierCosts: { [first.id]: "0.1" } });
    expect(refused.status).toBe(422);
    expect(Object.keys(refused.body.error.fields ?? {})[0]).toMatch(/^tierCosts\./);
    const unknown = await admin.edit<ErrorBody>("POST", VEO, "/versions/v2/routes", { providerId: "google", upstreamModel: "x", tierCosts: { nope: "0.1" } });
    expect(unknown.status).toBe(422);
    expect(unknown.body.error.fields?.["tierCosts.nope"]).toBeTruthy();
  });
});

describe("edits made elsewhere", () => {
  it("refuses an edit based on an old revision", async () => {
    const { revision } = (await admin.call<Model>("GET", VEO)).body;
    const first = await admin.call<Model>("PATCH", VEO, { description: "Mine." }, { "If-Match": String(revision) });
    expect(first.status).toBe(200);
    expect(first.body.revision).toBe(revision + 1);

    const late = await admin.call("PATCH", VEO, { description: "Theirs." }, { "If-Match": String(revision) });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe("stale");
    expect((await admin.call<Model>("GET", VEO)).body.description).toBe("Mine.");
  });

  it("needs the revision on every edit", async () => {
    expect((await admin.call("PATCH", VEO, { description: "Blind." })).status).toBe(422);
    const route = versionOf((await admin.call<Model>("GET", VEO)).body, "v2").routes[0];
    expect((await admin.call("DELETE", `${VEO}/versions/v2/routes/${route.id}`)).status).toBe(422);
  });
});

describe("schemas", () => {
  const draft = "/versions/v2";

  it("refuses a schema that isn't shaped like JSON Schema, naming where", async () => {
    const before = versionOf((await admin.call<Model>("GET", SORA)).body, "v2").inputSchema;
    const cases: [unknown, string][] = [
      [{ type: "object", properties: { x: null } }, "inputSchema.properties.x"],
      [{ properties: { prompt: { type: "string" } } }, "inputSchema.type"],
      [{ type: "object", properties: [] }, "inputSchema.properties"],
      [{ type: "object", properties: { prompt: { type: "string" } }, required: "prompt" }, "inputSchema.required"],
      [{ type: "object", properties: { prompt: { type: "string" } }, required: ["seed"] }, "inputSchema.required"],
      [{ type: "object", properties: { size: { type: "text" } } }, "inputSchema.properties.size.type"],
      [{ type: "object", properties: { size: { enum: [] } } }, "inputSchema.properties.size.enum"],
      [{ type: "object", properties: { urls: { type: "array", items: [] } } }, "inputSchema.properties.urls.items"],
      [{ type: "object", properties: { code: { type: "string", pattern: "(" } } }, "inputSchema.properties.code.pattern"],
    ];
    for (const [inputSchema, field] of cases) {
      const refused = await admin.edit("PATCH", SORA, draft, { inputSchema });
      expect(refused.status, field).toBe(422);
      expect(Object.keys((refused.body as unknown as ErrorBody).error.fields ?? {}), field).toEqual([field]);
    }
    expect(versionOf((await admin.call<Model>("GET", SORA)).body, "v2").inputSchema).toEqual(before);

    const ok = { type: "object", properties: { prompt: { type: "string", maxLength: 100 }, n: { type: ["integer", "null"] } }, required: ["prompt"] };
    expect((await admin.edit("PATCH", SORA, draft, { inputSchema: ok })).status).toBe(200);
  });

  it("won't publish a version holding a broken schema, even one copied with Start from", async () => {
    // Saved before schemas were checked.
    stored("google/veo-3.1", "v2").outputSchema = { type: "object", properties: { video: null } };
    await draftOfVeo();
    const refused = await admin.call("POST", `${VEO}/versions/v3/publish`, {});
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe("invalid_schema");
    expect(refused.body.error.fields?.["outputSchema.properties.video"]).toBeTruthy();
  });
});

describe("publishing a version", () => {
  /** A one-tier draft on Sora, with a route and a cost, ready but for what a test changes. */
  async function readyDraft() {
    const version = stored("openai/sora-2", "v2");
    version.routes = structuredClone(stored("openai/sora-2", "v1").routes);
    setCosts("openai/sora-2", "v2", 0.5);
    return version;
  }

  it("needs an active route on an active provider", async () => {
    const empty = await admin.call("POST", `${SORA}/versions/v2/publish`, {});
    expect(empty.body.error.code).toBe("no_route");

    await readyDraft();
    store.providers.forEach((p) => {
      if (p.id === "openai") p.status = "disabled";
    });
    const off = await admin.call("POST", `${SORA}/versions/v2/publish`, {});
    expect(off.status).toBe(422);
    expect(off.body.error.code).toBe("no_route");
  });

  it("needs a usable route that may be resold, on a white label model", async () => {
    await readyDraft();
    const model = store.models.find((m) => m.id === "openai/sora-2");
    if (!model) throw new Error("seed changed");
    model.disclosure = "white_label";
    store.providers.forEach((p) => {
      if (p.id === "openai") p.whiteLabelAllowed = false;
    });
    const refused = await admin.call("POST", `${SORA}/versions/v2/publish`, {});
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe("white_label_not_allowed");
  });

  it("needs pricing that fits the input schema", async () => {
    const version = await readyDraft();
    version.pricing.tierField = "nope";
    const missing = await admin.call("POST", `${SORA}/versions/v2/publish`, {});
    expect(missing.body.error).toMatchObject({ code: "invalid_pricing" });
    expect(missing.body.error.fields?.["pricing.tierField"]).toBeTruthy();

    version.pricing.tierField = "aspect_ratio";
    const unmapped = await admin.call("POST", `${SORA}/versions/v2/publish`, {});
    expect(unmapped.body.error.fields?.["pricing.tierValues"]).toBeTruthy();

    version.pricing.tierValues = { "16:9": "720p", "9:16": "720p", "1:1": "720p" };
    version.pricing.input = { unit: "image", price: "0.01", field: "nope" };
    const input = await admin.call("POST", `${SORA}/versions/v2/publish`, {});
    expect(input.body.error.fields?.["pricing.input.field"]).toBeTruthy();
  });

  it("asks for a reason under the minimum margin, and records it", async () => {
    await readyDraft();
    setCosts("openai/sora-2", "v2", 0.9);
    const refused = await admin.call("POST", `${SORA}/versions/v2/publish`, {});
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe("low_margin");
    expect(refused.body.error.fields?.reason).toMatch(/20%/);

    // The margin comes from settings.
    store.settings.minMargin = 0.05;
    expect((await admin.call("POST", `${SORA}/versions/v2/publish`, {})).status).toBe(200);
  });

  it("publishes under the minimum with a reason", async () => {
    await readyDraft();
    setCosts("openai/sora-2", "v2", 0.9);
    const published = await admin.call<Model>("POST", `${SORA}/versions/v2/publish`, { reason: "Launch offer." });
    expect(published.status).toBe(200);
    const audit = await admin.call<Page<AuditEntry>>("GET", `/audit?action=version.publish&targetId=openai/sora-2@v2`);
    expect(audit.body.items[0].detail).toMatchObject({ reason: "Launch offer." });
  });

  it("needs pricing.below_cost to sell below cost", async () => {
    await readyDraft();
    setCosts("openai/sora-2", "v2", 1.2);
    const publisher = await signedInWith(["catalog.view", "catalog.edit", "catalog.publish"]);
    const refused = await publisher.call("POST", `${SORA}/versions/v2/publish`, { reason: "Launch offer." });
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe("below_cost");
    // An admin holds it, and still gives a reason.
    expect((await admin.call("POST", `${SORA}/versions/v2/publish`, {})).body.error.code).toBe("low_margin");
    expect((await admin.call("POST", `${SORA}/versions/v2/publish`, { reason: "Loss leader." })).status).toBe(200);
  });

  it("holds each tier to its costliest route", async () => {
    const version = await readyDraft();
    version.routes.push({ ...structuredClone(version.routes[0]), id: "rt_second", priority: 2 });
    const tier = version.pricing.tiers[0].id;
    version.routes[1].tierCosts = { ...version.routes[1].tierCosts, [tier]: String(Number(version.pricing.tiers[0].price) * 0.95) };
    expect((await admin.call("POST", `${SORA}/versions/v2/publish`, {})).body.error.code).toBe("low_margin");
  });
});

describe("closing a model", () => {
  it("lets the default version be deprecated", async () => {
    const deprecated = await admin.call<Model>("POST", `${VEO}/versions/v2/deprecate`, { sunsetAt: inWeeks(6), replacement: null });
    expect(deprecated.status).toBe(200);
    expect(deprecated.body.defaultVersion).toBe("v2");
    expect(versionOf(deprecated.body, "v2").status).toBe("deprecated");
  });

  it("keeps a live version's last route, and lets a deprecated one drain", async () => {
    const version = stored("google/lyria-2", "v1");
    const [route] = version.routes;
    const LYRIA = "/models/google/lyria-2";
    const refused = await admin.edit("PATCH", LYRIA, `/versions/v1/routes/${route.id}`, { status: "draining" });
    expect(refused.status).toBe(422);
    expect((refused.body as unknown as ErrorBody).error.code).toBe("no_route");
    expect((await admin.edit("DELETE", LYRIA, `/versions/v1/routes/${route.id}`)).status).toBe(422);

    expect((await admin.call("POST", `${LYRIA}/versions/v1/deprecate`, { sunsetAt: inWeeks(4), replacement: null })).status).toBe(200);
    const drained = await admin.edit("PATCH", LYRIA, `/versions/v1/routes/${route.id}`, { status: "draining" });
    expect(drained.status).toBe(200);
    // A sunset date doesn't retire it; an operator does.
    version.sunsetAt = daysAgo(1);
    expect(versionOf((await admin.call<Model>("GET", LYRIA)).body, "v1").status).toBe("deprecated");
  });
});

describe("retiring a version", () => {
  const NANO = "/models/google/nano-banana-pro";
  const OLD = "2026-06-12";

  it("waits for the sunset date", async () => {
    const refused = await admin.call("POST", `${NANO}/versions/${OLD}/retire`);
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe("before_sunset");
    expect(versionOf((await admin.call<Model>("GET", NANO)).body, OLD).status).toBe("deprecated");
  });

  it("waits while a live app release pins it, then retires", async () => {
    stored("google/nano-banana-pro", OLD).sunsetAt = daysAgo(1);
    // Background Remover's first release used the June version; rolling back to it pins that again.
    expect((await admin.call<App>("POST", "/apps/background-remover/rollback", { release: 1 })).status).toBe(200);
    const pinned = await admin.call("POST", `${NANO}/versions/${OLD}/retire`);
    expect(pinned.status).toBe(422);
    expect(pinned.body.error.code).toBe("pinned_by_app");
    expect(pinned.body.error.message).toContain("Background Remover");

    expect((await admin.call<App>("POST", "/apps/background-remover/rollback", { release: 2 })).status).toBe(200);
    const retired = await admin.call<Model>("POST", `${NANO}/versions/${OLD}/retire`);
    expect(retired.status).toBe(200);
    expect(versionOf(retired.body, OLD).status).toBe("retired");
  });

  it("waits while another deprecated version suggests it", async () => {
    // Put v3 live, make it the default and deprecate v2 toward it; v1 still suggests v2.
    await draftOfVeo();
    setCosts("google/veo-3.1", "v3", 0.5);
    expect((await admin.call("POST", `${VEO}/versions/v3/publish`, {})).status).toBe(200);
    expect((await admin.call("POST", `${VEO}/versions/v3/default`)).status).toBe(200);
    expect((await admin.call("POST", `${VEO}/versions/v2/deprecate`, { sunsetAt: inWeeks(6), replacement: "v3" })).status).toBe(200);
    stored("google/veo-3.1", "v2").sunsetAt = daysAgo(1);

    const refused = await admin.call("POST", `${VEO}/versions/v2/retire`);
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe("is_replacement");
    expect(refused.body.error.message).toContain("v1");
  });

  it("won't retire the default while another version is live", async () => {
    await draftOfVeo();
    setCosts("google/veo-3.1", "v3", 0.5);
    expect((await admin.call("POST", `${VEO}/versions/v3/publish`, {})).status).toBe(200);
    expect((await admin.call("POST", `${VEO}/versions/v2/deprecate`, { sunsetAt: inWeeks(6), replacement: "v3" })).status).toBe(200);
    stored("google/veo-3.1", "v2").sunsetAt = daysAgo(1);
    const refused = await admin.call("POST", `${VEO}/versions/v2/retire`);
    expect(refused.body.error.code).toBe("is_default");
  });
});

describe("apps", () => {
  const release = {
    steps: [{ id: "render", stage: "Rendering", model: "openai/gpt-image-1.5@v1", input: { prompt: "{{input.prompt}}" } }],
    stages: ["Rendering"],
    outputMap: { images: "{{steps.render.output.images}}" },
    priceMicros: 5_000_000,
  };

  it("keeps a paused app paused when a release is deployed or rolled back", async () => {
    const before = await admin.call<App>("GET", "/apps/voice-changer");
    expect(before.body.status).toBe("paused");
    const reason = before.body.pausedReason;
    expect(reason).toBeTruthy();

    const rolledBack = await admin.call<App>("POST", "/apps/voice-changer/rollback", { release: 1 });
    expect(rolledBack.status).toBe(200);
    expect(rolledBack.body).toMatchObject({ status: "paused", liveRelease: 1, pausedReason: reason });

    expect((await admin.call<App>("POST", "/apps/voice-changer/releases")).status).toBe(200);
    const published = await admin.call<App>("POST", "/apps/voice-changer/releases/3/publish", { reason: "Testing." });
    expect(published.status).toBe(200);
    expect(published.body).toMatchObject({ status: "paused", liveRelease: 3, pausedReason: reason });

    const resumed = await admin.call<App>("POST", "/apps/voice-changer/resume");
    expect(resumed.body).toMatchObject({ status: "live", liveRelease: 3, pausedReason: null });
  });

  it("still puts a draft app live with its first release", async () => {
    const created = await admin.call<App>("POST", "/apps", { slug: "caption-maker", name: "Caption maker", category: "image" });
    expect(created.body.status).toBe("draft");
    expect((await admin.call("PATCH", "/apps/caption-maker/releases/1", release)).status).toBe(200);
    const published = await admin.call<App>("POST", "/apps/caption-maker/releases/1/publish", {});
    expect(published.status).toBe(200);
    expect(published.body.status).toBe("live");
  });

  it("refuses templates that read what isn't there yet", async () => {
    await admin.call("POST", "/apps", { slug: "caption-maker", name: "Caption maker", category: "image" });
    const cases: [object, string][] = [
      [{ ...release, steps: [{ ...release.steps[0], input: { prompt: "{{steps.later.output.text}}" } }] }, "steps.0.input"],
      [{ ...release, steps: [{ ...release.steps[0], input: { prompt: "{{env.SECRET}}" } }] }, "steps.0.input"],
      [{ ...release, steps: [{ ...release.steps[0], stage: "Nope" }] }, "steps.0.stage"],
      [{ ...release, outputMap: {} }, "outputMap"],
      [{ ...release, outputMap: { image: "{{steps.nope.output.url}}" } }, "outputMap"],
    ];
    for (const [body, field] of cases) {
      expect((await admin.call("PATCH", "/apps/caption-maker/releases/1", body)).status, field).toBe(200);
      const refused = await admin.call("POST", "/apps/caption-maker/releases/1/publish", {});
      expect(refused.status, field).toBe(422);
      expect(refused.body.error.code, field).toBe("invalid_release");
      expect(refused.body.error.fields?.[field], field).toBeTruthy();
    }
  });

  it("makes steps pin a version", async () => {
    await admin.call("POST", "/apps", { slug: "caption-maker", name: "Caption maker", category: "image" });
    const unpinned = await admin.call("PATCH", "/apps/caption-maker/releases/1", { steps: [{ id: "a", model: "openai/gpt-image-1.5", input: {} }] });
    expect(unpinned.status).toBe(422);
    expect(unpinned.body.error.fields?.["steps.0.model"]).toMatch(/publisher\/slug@version/);
  });

  it("holds a release to the margin rule", async () => {
    await admin.call("POST", "/apps", { slug: "caption-maker", name: "Caption maker", category: "image" });
    await admin.call("PATCH", "/apps/caption-maker/releases/1", { ...release, priceMicros: 1 });
    const publisher = await signedInWith(["catalog.view", "catalog.edit", "catalog.publish"]);
    const refused = await publisher.call("POST", "/apps/caption-maker/releases/1/publish", { reason: "Testing." });
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe("below_cost");
  });
});

describe("providers", () => {
  it("turns on a provider added from the panel, once it has a credential", async () => {
    await admin.call("POST", "/providers", { id: "acme", name: "Acme", kind: "first_party", adapter: "fake", baseUrl: "https://acme.example", regions: ["us"] });
    const refused = await admin.call("POST", "/providers/acme/enable");
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe("no_credential");

    await admin.call("PUT", "/providers/acme/credential", { secret: "a-long-enough-secret" });
    expect((await admin.call<Provider>("POST", "/providers/acme/enable")).body.status).toBe("active");
    expect((await admin.call<Provider>("POST", "/providers/acme/disable", { reason: "Contract ended." })).body.status).toBe("disabled");
    expect((await admin.call("POST", "/providers/acme/resume")).status).toBe(409);
  });

  it("only takes the agreed adapters", async () => {
    const refused = await admin.call("POST", "/providers", { id: "fal", name: "fal", kind: "first_party", adapter: "fal", baseUrl: "https://fal.example", regions: ["us"] });
    expect(refused.status).toBe(422);
    expect(refused.body.error.fields?.adapter).toBeTruthy();
    const kind = await admin.call("POST", "/providers", { id: "reseller", name: "R", kind: "aggregator", adapter: "fake", baseUrl: "https://r.example", regions: ["us"] });
    expect(kind.body.error.fields?.kind).toBeTruthy();
  });
});

describe("permissions", () => {
  const BOOST = "/models/modelvend/prompt-boost-1";

  it("needs catalog.publish to show a model to more customers", async () => {
    const editor = await signedInWith(["catalog.view", "catalog.edit"]);
    const refused = await editor.edit("PATCH", BOOST, "", { name: "Prompt Boost", visibility: "public" });
    expect(refused.status).toBe(403);
    const unchanged = await admin.call<Model>("GET", BOOST);
    expect(unchanged.body).toMatchObject({ visibility: "private", name: "Prompt Boost 1" });

    // Narrowing and other edits stay with catalog.edit.
    expect((await editor.edit("PATCH", BOOST, "", { name: "Prompt Boost" })).status).toBe(200);
    expect((await editor.edit("PATCH", VEO, "", { visibility: "unlisted" })).status).toBe(200);

    const publisher = await signedInWith(["catalog.view", "catalog.edit", "catalog.publish"]);
    const widened = await publisher.edit("PATCH", BOOST, "", { visibility: "unlisted" });
    expect(widened.status).toBe(200);
    expect(widened.body.visibility).toBe("unlisted");
  });

  it("starts a model private, and needs catalog.publish to start it wider", async () => {
    const editor = await signedInWith(["catalog.view", "catalog.edit"]);
    const base = { publisher: "acme", name: "Clip", modality: "video" };
    expect((await editor.call("POST", "/models", { ...base, slug: "a", visibility: "public" })).status).toBe(403);
    expect((await editor.call<Model>("POST", "/models", { ...base, slug: "b" })).body.visibility).toBe("private");
  });

  it("needs catalog.publish for a route on a live version, and pricing.edit for prices", async () => {
    const editor = await signedInWith(["catalog.view", "catalog.edit"]);
    const live = versionOf((await admin.call<Model>("GET", VEO)).body, "v2");
    const costs = Object.fromEntries(live.pricing.tiers.map((tier) => [tier.id, "0.1"]));
    const route = { providerId: "google", upstreamModel: "x", tierCosts: costs };
    expect((await editor.edit("POST", VEO, "/versions/v2/routes", route)).status).toBe(403);

    const pricing = { unit: "second", defaultTier: "standard", tierField: null, tierValues: {}, tiers: [{ id: "standard", label: "Standard", price: "1" }], input: null, promo: null };
    expect((await editor.edit("PATCH", SORA, "/versions/v2", { pricing })).status).toBe(403);
    const pricer = await signedInWith(["catalog.view", "catalog.edit", "pricing.edit"]);
    expect((await pricer.edit("PATCH", SORA, "/versions/v2", { pricing })).status).toBe(200);
  });
});

describe("customer limits", () => {
  it("needs a reason to lower a limit, and records it", async () => {
    const list = await admin.call<Page<CustomerRow>>("GET", "/customers?limit=1");
    const customer = list.body.items[0];
    expect(customer).toBeDefined();
    // Start from the platform defaults: 120 a minute, 10 at once, no spend limit.
    const record = store.customers.find((c) => c.id === customer.id);
    if (!record) throw new Error("seed changed");
    record.limitOverrides = {};

    // A spend limit where there was none counts as lowering.
    expect((await admin.call("PATCH", `/customers/${customer.id}`, { limits: { monthlySpendMicros: 500_000_000 } })).status).toBe(422);
    const refused = await admin.call("PATCH", `/customers/${customer.id}`, { limits: { dailySpendMicros: 50_000_000 } });
    expect(refused.body.error.fields?.reason).toBeTruthy();
    // Raising needs no reason.
    const raised = await admin.call<Customer>("PATCH", `/customers/${customer.id}`, { limits: { requestsPerMinute: 500, queueSize: 200 } });
    expect(raised.status).toBe(200);
    expect(raised.body.overrides.sort()).toEqual(["queueSize", "requestsPerMinute"]);

    const lowered = await admin.call<Customer>("PATCH", `/customers/${customer.id}`, { limits: { dailySpendMicros: 50_000_000 }, reason: "Asked by email" });
    expect(lowered.status).toBe(200);
    // Left out goes back to the default, and that lowers the two raised above too.
    expect(lowered.body.limits).toMatchObject({ dailySpendMicros: 50_000_000, requestsPerMinute: 120, queueSize: 50 });
    const audit = await admin.call<Page<AuditEntry>>("GET", `/audit?action=customer.update&targetId=${customer.id}`);
    expect(audit.body.items[0].detail).toMatchObject({ reason: "Asked by email", lowered: expect.arrayContaining(["dailySpendMicros", "requestsPerMinute"]) });
  });

  it("follows the platform default until a workspace has its own value", async () => {
    const record = store.customers[0];
    record.limitOverrides = {};
    store.settings.limits.concurrency = 42;
    expect((await admin.call<Customer>("GET", `/customers/${record.id}`)).body.limits.concurrency).toBe(42);
  });

  it("finds a customer by any member's email", async () => {
    const record = store.customers.find((c) => c.memberEmails.length > 1);
    if (!record) throw new Error("seed changed");
    const found = await admin.call<Page<CustomerRow>>("GET", `/customers?query=${encodeURIComponent(record.memberEmails[1])}`);
    expect(found.body.items.map((c) => c.id)).toContain(record.id);
  });
});

describe("credits", () => {
  const customerId = () => store.customers[0].id;

  it("needs a kind to add credit, and files it by kind", async () => {
    const id = customerId();
    const refused = await admin.call("POST", `/customers/${id}/credits`, { amountMicros: 5_000_000, reason: "Goodwill" });
    expect(refused.status).toBe(422);
    expect(refused.body.error.fields?.kind).toBeTruthy();

    await admin.call("POST", `/customers/${id}/credits`, { amountMicros: 5_000_000, kind: "gift", reason: "Goodwill" });
    await admin.call("POST", `/customers/${id}/credits`, { amountMicros: 7_000_000, kind: "purchased", reason: "Paid by wire" });
    const ledger = await admin.call<Page<{ kind: string; amountMicros: number }>>("GET", `/customers/${id}/ledger?limit=2`);
    expect(ledger.body.items.map((entry) => [entry.kind, entry.amountMicros])).toEqual([
      ["top_up", 7_000_000],
      ["grant", 5_000_000],
    ]);
    expect(ledger.body.nextCursor).not.toBeNull();
  });

  it("asks before going below zero", async () => {
    const id = customerId();
    const { balanceMicros } = (await admin.call<Customer>("GET", `/customers/${id}`)).body;
    const amountMicros = -(balanceMicros + 1_000_000);
    const refused = await admin.call("POST", `/customers/${id}/credits`, { amountMicros, reason: "Chargeback" });
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe("negative_balance");
    const taken = await admin.call<Customer>("POST", `/customers/${id}/credits`, { amountMicros, reason: "Chargeback", confirmNegative: true });
    expect(taken.status).toBe(200);
    expect(taken.body.balanceMicros).toBe(-1_000_000);
  });

  it("leaves more than $1,000 to admins", async () => {
    const id = customerId();
    const finance = await signedInWith(["customers.view", "customers.credits"]);
    const refused = await finance.call("POST", `/customers/${id}/credits`, { amountMicros: 1_000_000_001, kind: "gift", reason: "Goodwill" });
    expect(refused.status).toBe(403);
    expect((await finance.call("POST", `/customers/${id}/credits`, { amountMicros: 1_000_000_000, kind: "gift", reason: "Goodwill" })).status).toBe(200);
    expect((await admin.call("POST", `/customers/${id}/credits`, { amountMicros: 1_000_000_001, kind: "gift", reason: "Goodwill" })).status).toBe(200);
  });
});

/** Every page of the task list. */
async function allTasks(): Promise<TaskRow[]> {
  const first = await admin.call<Page<TaskRow>>("GET", "/tasks?limit=200");
  const rows = [...first.body.items];
  let cursor = first.body.nextCursor;
  while (cursor) {
    const next = await admin.call<Page<TaskRow>>("GET", `/tasks?limit=200&cursor=${cursor}`);
    rows.push(...next.body.items);
    cursor = next.body.nextCursor;
  }
  return rows;
}

describe("billing in the task log", () => {
  it("charges only succeeded tasks, at the promo price", async () => {
    const rows = await allTasks();
    expect(rows.filter((r) => r.status !== "succeeded" && r.amountMicros !== 0)).toEqual([]);

    const promoted = store.models.filter((m) => m.versionList.some((v) => v.pricing.promo));
    expect(promoted.length).toBeGreaterThan(0);
    for (const model of promoted) {
      for (const row of rows.filter((r) => r.model === model.id && r.status === "succeeded" && r.app === null)) {
        const version = model.versionList.find((v) => v.id === row.version);
        const tier = version?.pricing.tiers.find((t) => t.id === row.tier);
        const expected = Math.round((row.units ?? 0) * Number(tier?.price) * (1 - (version?.pricing.promo ?? 0)) * 1_000_000);
        expect(row.amountMicros).toBe(expected);
      }
    }
  });

  it("hides an app run's steps from the list and shows them on the run", async () => {
    const rows = await allTasks();
    expect(rows.every((r) => r.parentId === null)).toBe(true);
    const run = rows.find((r) => r.app !== null);
    if (!run) throw new Error("no app run in the seed");
    expect(run.model).toBeNull();
    const detail = await admin.call<TaskDetail>("GET", `/tasks/${run.id}`);
    expect(detail.body.steps.length).toBeGreaterThan(0);
    expect(detail.body.steps.every((step) => step.parentId === run.id && step.model !== null && step.amountMicros === 0)).toBe(true);
    expect(detail.body.costMicros).toBe(detail.body.steps.reduce((total, step) => total + step.costMicros, 0));
  });

  it("holds credit for unfinished tasks only", async () => {
    const rows = await allTasks();
    expect(rows.filter((r) => ["succeeded", "failed", "canceled"].includes(r.status) && r.holdMicros !== 0)).toEqual([]);
    const held = store.customers.filter((c) => c.heldMicros > 0);
    expect(held.length).toBeGreaterThan(0);
  });

  it("refunds only succeeded tasks", async () => {
    const failed = await admin.call<Page<TaskRow>>("GET", "/tasks?status=failed&limit=1");
    const row = failed.body.items[0];
    expect(row).toBeDefined();
    const refused = await admin.call("POST", `/tasks/${row.id}/refund`, { reason: "Upset customer" });
    expect(refused.status).toBe(422);
  });
});

describe("audit by customer", () => {
  it("includes the customer's refunds and key changes", async () => {
    const succeeded = await admin.call<Page<TaskRow>>("GET", "/tasks?status=succeeded&limit=200");
    const task = succeeded.body.items.find((r) => r.amountMicros > 0);
    if (!task) throw new Error("no paid task");
    const customerId = task.customer.id;
    expect((await admin.call<TaskDetail>("POST", `/tasks/${task.id}/refund`, { reason: "Blank output." })).status).toBe(200);

    const keys = await admin.call<Page<ApiKeyRow>>("GET", `/api-keys?customerId=${customerId}&status=active`);
    const key = keys.body.items[0];
    expect((await admin.call("PATCH", `/api-keys/${key.id}`, { spendLimitMicros: 75_000_000 })).status).toBe(200);
    expect((await admin.call("POST", `/api-keys/${key.id}/revoke`, { reason: "Leaked." })).status).toBe(200);
    expect((await admin.call("POST", `/customers/${customerId}/credits`, { amountMicros: 5_000_000, kind: "gift", reason: "Sorry" })).status).toBe(200);

    const trail = await admin.call<Page<AuditEntry>>("GET", `/audit?customerId=${customerId}&limit=200`);
    const actions = trail.body.items.map((entry) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(["task.refund", "api_key.update", "api_key.revoke", "customer.credits"]));
    // Nothing about other customers.
    const others = trail.body.items.filter(
      (entry) =>
        !(entry.targetType === "customer" && entry.targetId === customerId) && entry.detail.customerId !== customerId,
    );
    expect(others).toEqual([]);
  });

  it("finds a key by its ID, as the audit log links it", async () => {
    const keys = await admin.call<Page<ApiKeyRow>>("GET", "/api-keys?limit=1");
    const key = keys.body.items[0];
    const found = await admin.call<Page<ApiKeyRow>>("GET", `/api-keys?query=${key.id}`);
    expect(found.body.items.map((k) => k.id)).toEqual([key.id]);
  });

  it("never keeps a live or test key type", async () => {
    const keys = await admin.call<Page<ApiKeyRow>>("GET", "/api-keys?limit=200");
    expect(keys.body.items.every((key) => /^mv_[0-9a-f]+$/.test(key.prefix))).toBe(true);
  });
});
