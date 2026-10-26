import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import type { ApiKeyRow } from "@modelvend/admin-api/api-keys";
import type { App } from "@modelvend/admin-api/apps";
import type { AuditEntry } from "@modelvend/admin-api/audit";
import type { Permission } from "@modelvend/admin-api/auth";
import type { Page } from "@modelvend/admin-api/client";
import type { Customer, CustomerRow } from "@modelvend/admin-api/customers";
import type { Model, ModelVersion } from "@modelvend/admin-api/models";
import type { RequestDetail, RequestRow } from "@modelvend/admin-api/requests";
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

  async call<T = ErrorBody>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> {
    const url = `http://localhost/api/admin/v1${path}`;
    const headers = new Headers();
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
const SEEDANCE = "/models/bytedance/seedance-2.5";

/** A draft copied from Seedance v2, so it has its three routes costing per second. */
async function draftWithRoutes(id = "v4"): Promise<ModelVersion> {
  const created = await admin.call<Model>("POST", `${SEEDANCE}/versions`, { id, label: "2.6", from: "v2" });
  expect(created.status).toBe(200);
  return versionOf(created.body, id);
}

describe("billing units", () => {
  it("refuses a new billing unit while routes cost in the old one", async () => {
    const draft = await draftWithRoutes();
    const pricing = { ...draft.pricing, unit: "minute" };
    const refused = await admin.call(`PATCH`, `${SEEDANCE}/versions/v4`, { label: "2.6 per minute", pricing });
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe("unit_mismatch");
    expect(refused.body.error.fields?.["pricing.unit"]).toMatch(/per second/);
    // Nothing changed, not even the label sent alongside.
    const after = versionOf((await admin.call<Model>("GET", SEEDANCE)).body, "v4");
    expect(after.pricing.unit).toBe("second");
    expect(after.label).toBe("2.6");

    // Re-entering each route's cost per minute (a draft takes it) lets the unit change.
    for (const route of draft.routes) {
      const moved = await admin.call<Model>("PATCH", `${SEEDANCE}/versions/v4/routes/${route.id}`, {
        cost: { unit: "minute", price: route.cost.price * 60 },
      });
      expect(moved.status).toBe(200);
    }
    // While they differ, tier costs are unknown rather than a per-minute number read per second.
    const between = versionOf((await admin.call<Model>("GET", SEEDANCE)).body, "v4");
    expect(between.pricing.tiers.every((tier) => tier.cost === null)).toBe(true);

    const changed = await admin.call<Model>("PATCH", `${SEEDANCE}/versions/v4`, { pricing });
    expect(changed.status).toBe(200);
    const v4 = versionOf(changed.body, "v4");
    expect(v4.pricing.unit).toBe("minute");
    expect(v4.pricing.tiers.find((tier) => tier.id === v4.pricing.defaultTier)?.cost).toBeCloseTo(0.13 * 60, 4);
  });

  it("refuses to promote a version whose routes cost in another unit", async () => {
    const draft = await draftWithRoutes();
    const [route] = draft.routes;
    await admin.call("PATCH", `${SEEDANCE}/versions/v4/routes/${route.id}`, { cost: { unit: "minute", price: 7.8 } });
    for (const to of ["staging", "live"]) {
      const refused = await admin.call("POST", `${SEEDANCE}/versions/v4/promote`, { to });
      expect(refused.status).toBe(422);
      expect(refused.body.error.code).toBe("unit_mismatch");
    }
    await admin.call("PATCH", `${SEEDANCE}/versions/v4/routes/${route.id}`, { cost: { unit: "second", price: 0.13 } });
    expect((await admin.call("POST", `${SEEDANCE}/versions/v4/promote`, { to: "staging" })).status).toBe(200);
  });

  it("keeps a live version's route costs in its unit", async () => {
    const live = versionOf((await admin.call<Model>("GET", SEEDANCE)).body, "v2");
    const route = live.routes[0];
    const path = `${SEEDANCE}/versions/v2/routes/${route.id}`;
    const refused = await admin.call("PATCH", path, { cost: { unit: "minute", price: 7.8 } });
    expect(refused.status).toBe(422);
    expect(refused.body.error.fields?.["cost.unit"]).toMatch(/per second/);

    // A route stored in another unit (data from before the check) keeps it through unrelated edits, the way the
    // route dialog sends it back, but a new cost has to be in the version's unit.
    const stored = store.models.find((m) => m.id === "bytedance/seedance-2.5")?.versionList.find((v) => v.id === "v2")?.routes.find((r) => r.id === route.id);
    if (!stored) throw new Error("seed changed");
    stored.cost = { unit: "minute", price: 7.8 };
    const kept = await admin.call<Model>("PATCH", path, { cost: { unit: "minute", price: 7.8 }, maxConcurrency: 90 });
    expect(kept.status).toBe(200);
    expect(versionOf(kept.body, "v2").pricing.tiers.every((tier) => tier.cost === null)).toBe(true);
    expect((await admin.call("PATCH", path, { cost: { unit: "minute", price: 8 } })).status).toBe(422);
    const fixed = await admin.call<Model>("PATCH", path, { cost: { unit: "second", price: 0.13 } });
    expect(fixed.status).toBe(200);
    expect(versionOf(fixed.body, "v2").pricing.tiers.every((tier) => tier.cost !== null)).toBe(true);
  });
});

describe("schemas", () => {
  const draft = `${SEEDANCE}/versions/v3`;

  it("refuses a schema that isn't shaped like JSON Schema, naming where", async () => {
    const before = versionOf((await admin.call<Model>("GET", SEEDANCE)).body, "v3").inputSchema;
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
      const refused = await admin.call("PATCH", draft, { inputSchema });
      expect(refused.status, field).toBe(422);
      expect(Object.keys(refused.body.error.fields ?? {}), field).toEqual([field]);
    }
    const after = versionOf((await admin.call<Model>("GET", SEEDANCE)).body, "v3").inputSchema;
    expect(after).toEqual(before);

    const ok = { type: "object", properties: { prompt: { type: "string", maxLength: 100 }, n: { type: ["integer", "null"] } }, required: ["prompt"] };
    expect((await admin.call("PATCH", draft, { inputSchema: ok })).status).toBe(200);
  });

  it("won't promote a version holding a broken schema, even one copied with Start from", async () => {
    const v2 = store.models.find((m) => m.id === "bytedance/seedance-2.5")?.versionList.find((v) => v.id === "v2");
    if (!v2) throw new Error("seed changed");
    // Saved before schemas were checked.
    v2.outputSchema = { type: "object", properties: { video: null } };
    await draftWithRoutes();
    const refused = await admin.call("POST", `${SEEDANCE}/versions/v4/promote`, { to: "staging" });
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe("invalid_schema");
    expect(refused.body.error.fields?.["outputSchema.properties.video"]).toBeTruthy();
  });
});

describe("retiring a version", () => {
  const LUMEN = "/models/modelvend/lumen-1";
  const lumen = () => store.models.find((m) => m.id === "modelvend/lumen-1");

  it("waits for the sunset date", async () => {
    const refused = await admin.call("POST", `${LUMEN}/versions/v1/retire`);
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe("before_sunset");
    expect(versionOf((await admin.call<Model>("GET", LUMEN)).body, "v1").status).toBe("deprecated");
  });

  it("waits while a live app release pins it, then retires", async () => {
    const v1 = lumen()?.versionList.find((v) => v.id === "v1");
    if (!v1) throw new Error("seed changed");
    v1.sunsetAt = daysAgo(1);
    // Image to Video's first release used Lumen v1; rolling back to it pins v1 again.
    expect((await admin.call<App>("POST", "/apps/image-to-video/rollback", { release: 1 })).status).toBe(200);
    const pinned = await admin.call("POST", `${LUMEN}/versions/v1/retire`);
    expect(pinned.status).toBe(422);
    expect(pinned.body.error.code).toBe("pinned_by_app");
    expect(pinned.body.error.message).toContain("Image to Video");

    expect((await admin.call<App>("POST", "/apps/image-to-video/rollback", { release: 2 })).status).toBe(200);
    const retired = await admin.call<Model>("POST", `${LUMEN}/versions/v1/retire`);
    expect(retired.status).toBe(200);
    expect(versionOf(retired.body, "v1").status).toBe("retired");
  });

  it("waits while another deprecated version names it as the replacement", async () => {
    // Put v3 live, make it the default and deprecate v2 toward it; v1 still names v2 as its replacement.
    const route = await admin.call<Model>("POST", `${SEEDANCE}/versions/v3/routes`, {
      providerId: "byteplus",
      upstreamModel: "seedance-2-5-pro-251101",
      priority: 1,
      weight: 100,
      cost: { unit: "second", price: 0.13 },
      region: "ap-southeast-1",
      maxConcurrency: null,
    });
    expect(route.status).toBe(200);
    expect((await admin.call("POST", `${SEEDANCE}/versions/v3/promote`, { to: "live" })).status).toBe(200);
    expect((await admin.call("POST", `${SEEDANCE}/versions/v3/default`)).status).toBe(200);
    const inWeeks = new Date(Date.now() + 6 * 7 * 86_400_000).toISOString();
    expect((await admin.call("POST", `${SEEDANCE}/versions/v2/deprecate`, { sunsetAt: inWeeks, replacement: "v3" })).status).toBe(200);
    const v2 = store.models.find((m) => m.id === "bytedance/seedance-2.5")?.versionList.find((v) => v.id === "v2");
    if (!v2) throw new Error("seed changed");
    v2.sunsetAt = daysAgo(1);

    const refused = await admin.call("POST", `${SEEDANCE}/versions/v2/retire`);
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe("is_replacement");
    expect(refused.body.error.message).toContain("v1");
  });
});

describe("app pauses", () => {
  it("keeps a paused app paused when a release is deployed or rolled back", async () => {
    const before = await admin.call<App>("GET", "/apps/voice-changer");
    expect(before.body.status).toBe("paused");
    const reason = before.body.pausedReason;
    expect(reason).toBeTruthy();

    const rolledBack = await admin.call<App>("POST", "/apps/voice-changer/rollback", { release: 1 });
    expect(rolledBack.status).toBe(200);
    expect(rolledBack.body).toMatchObject({ status: "paused", liveRelease: 1, pausedReason: reason });

    expect((await admin.call<App>("POST", "/apps/voice-changer/releases")).status).toBe(200);
    const published = await admin.call<App>("POST", "/apps/voice-changer/releases/3/publish");
    expect(published.status).toBe(200);
    expect(published.body).toMatchObject({ status: "paused", liveRelease: 3, pausedReason: reason });

    const resumed = await admin.call<App>("POST", "/apps/voice-changer/resume");
    expect(resumed.body).toMatchObject({ status: "live", liveRelease: 3, pausedReason: null });
  });

  it("still puts a draft app live with its first release", async () => {
    const created = await admin.call<App>("POST", "/apps", { slug: "caption-maker", name: "Caption maker", category: "image" });
    expect(created.body.status).toBe("draft");
    await admin.call("PATCH", "/apps/caption-maker/releases/1", {
      steps: [{ name: "Upscale", modelId: "topaz/image-upscale", version: "v1", params: {} }],
      price: 0.05,
    });
    const published = await admin.call<App>("POST", "/apps/caption-maker/releases/1/publish");
    expect(published.body.status).toBe("live");
  });
});

describe("visibility", () => {
  const BOOST = "/models/modelvend/prompt-boost-1";

  it("needs catalog.publish to show a model to more customers", async () => {
    const editor = await signedInWith(["catalog.view", "catalog.edit"]);
    const refused = await editor.call("PATCH", BOOST, { name: "Prompt Boost", visibility: "public" });
    expect(refused.status).toBe(403);
    const unchanged = await admin.call<Model>("GET", BOOST);
    expect(unchanged.body).toMatchObject({ visibility: "private", name: "Prompt Boost 1" });

    // Narrowing and other edits stay with catalog.edit.
    expect((await editor.call("PATCH", BOOST, { name: "Prompt Boost" })).status).toBe(200);
    expect((await editor.call("PATCH", "/models/google/veo-3.1", { visibility: "unlisted" })).status).toBe(200);

    const publisher = await signedInWith(["catalog.view", "catalog.edit", "catalog.publish"]);
    const widened = await publisher.call<Model>("PATCH", BOOST, { visibility: "unlisted" });
    expect(widened.status).toBe(200);
    expect(widened.body.visibility).toBe("unlisted");
  });
});

describe("customer limits", () => {
  it("needs a reason to lower a tier or limit, and records it", async () => {
    const list = await admin.call<Page<CustomerRow>>("GET", "/customers?tier=standard&limit=1");
    const customer = list.body.items[0];
    expect(customer).toBeDefined();
    // Start from the tier's defaults: 120 a minute, 10 at once, no spend cap.
    const record = store.customers.find((c) => c.id === customer.id);
    if (!record) throw new Error("seed changed");
    record.limitOverrides = {};

    const refused = await admin.call("PATCH", `/customers/${customer.id}`, { tier: "free" });
    expect(refused.status).toBe(422);
    expect(refused.body.error.fields?.reason).toBeTruthy();
    // A spend cap where there was none counts as lowering too.
    expect((await admin.call("PATCH", `/customers/${customer.id}`, { limits: { monthlySpendCap: 500 } })).status).toBe(422);
    // Raising needs no reason.
    expect((await admin.call("PATCH", `/customers/${customer.id}`, { limits: { requestsPerMinute: 500 } })).status).toBe(200);

    const lowered = await admin.call<Customer>("PATCH", `/customers/${customer.id}`, { tier: "free", limits: {}, reason: "Asked to downgrade" });
    expect(lowered.status).toBe(200);
    expect(lowered.body.limits.monthlySpendCap).toBe(10);
    const audit = await admin.call<Page<AuditEntry>>("GET", `/audit?action=customer.update&targetId=${customer.id}`);
    expect(audit.body.items[0].detail).toMatchObject({ reason: "Asked to downgrade", lowered: expect.arrayContaining(["tier", "monthlySpendCap"]) });
  });
});

describe("billing in the request log", () => {
  it("charges only succeeded requests, at the promo price", async () => {
    const all = await admin.call<Page<RequestRow>>("GET", "/requests?limit=200");
    const rows = [...all.body.items];
    let cursor = all.body.nextCursor;
    while (cursor) {
      const next = await admin.call<Page<RequestRow>>("GET", `/requests?limit=200&cursor=${cursor}`);
      rows.push(...next.body.items);
      cursor = next.body.nextCursor;
    }
    expect(rows.filter((r) => r.status !== "succeeded" && r.price !== 0)).toEqual([]);

    // Seedance has a 50% launch promo: every price is units × a tier price × 0.5.
    const tiers = store.models.find((m) => m.id === "bytedance/seedance-2.5")?.versionList[0].pricing.tiers.map((t) => t.price) ?? [];
    const seedance = rows.filter((r) => r.model === "bytedance/seedance-2.5" && r.status === "succeeded" && r.app === null);
    expect(seedance.length).toBeGreaterThan(0);
    for (const row of seedance) {
      expect(tiers.some((price) => Math.abs(row.price - row.units * price * 0.5) < 1e-6)).toBe(true);
    }
  });

  it("refunds only succeeded requests", async () => {
    const failed = await admin.call<Page<RequestRow>>("GET", "/requests?status=failed&limit=1");
    const row = failed.body.items[0];
    expect(row).toBeDefined();
    const refused = await admin.call("POST", `/requests/${row.id}/refund`, { reason: "Upset customer" });
    expect(refused.status).toBe(422);
  });
});

describe("audit by customer", () => {
  it("includes the customer's refunds and key changes", async () => {
    const succeeded = await admin.call<Page<RequestRow>>("GET", "/requests?status=succeeded&limit=200");
    const request = succeeded.body.items.find((r) => r.price > 0);
    if (!request) throw new Error("no paid request");
    const customerId = request.customer.id;
    expect((await admin.call<RequestDetail>("POST", `/requests/${request.id}/refund`, { reason: "Blank output." })).status).toBe(200);

    const keys = await admin.call<Page<ApiKeyRow>>("GET", `/api-keys?customerId=${customerId}&status=active`);
    const key = keys.body.items[0];
    expect((await admin.call("PATCH", `/api-keys/${key.id}`, { spendLimit: 75 })).status).toBe(200);
    expect((await admin.call("POST", `/api-keys/${key.id}/revoke`, { reason: "Leaked." })).status).toBe(200);
    expect((await admin.call("POST", `/customers/${customerId}/credits`, { amount: 5, reason: "Sorry" })).status).toBe(200);

    const trail = await admin.call<Page<AuditEntry>>("GET", `/audit?customerId=${customerId}&limit=200`);
    const actions = trail.body.items.map((entry) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(["request.refund", "api_key.update", "api_key.revoke", "customer.credits"]));
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
});
