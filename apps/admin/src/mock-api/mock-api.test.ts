import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import type { ApiKeyRow } from "@/lib/api/api-keys";
import type { App } from "@/lib/api/apps";
import type { AuditEntry } from "@/lib/api/audit";
import type { Operator } from "@/lib/api/auth";
import type { Page } from "@/lib/api/client";
import type { Customer, CustomerRow } from "@/lib/api/customers";
import type { Model, ModelSummary } from "@/lib/api/models";
import type { Overview } from "@/lib/api/overview";
import type { RequestDetail, RequestRow } from "@/lib/api/requests";
import { MOCK_PASSWORD, handleMock, mockSettings } from ".";
import { createStore } from "./seed";
import { resetStore } from "./store";

interface ErrorBody {
  error: { code: string; message: string; fields?: Record<string, string> };
}

/** Cookies the mock set, sent back like a browser would. */
const jar = new Map<string, string>();

async function call<T = ErrorBody>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> {
  const url = `http://localhost/api/admin/v1${path}`;
  const headers = new Headers();
  if (jar.size > 0) headers.set("cookie", [...jar].map(([name, value]) => `${name}=${value}`).join("; "));
  if (method !== "GET") headers.set("content-type", "application/json");
  const request = new NextRequest(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const response = await handleMock(request, new URL(url).pathname.replace(/^\/api/, ""));
  for (const cookie of response.headers.getSetCookie()) {
    const [pair, ...attributes] = cookie.split(";");
    const [name, value] = pair.split("=");
    if (attributes.some((a) => a.trim().toLowerCase() === "max-age=0")) jar.delete(name);
    else jar.set(name, value);
  }
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : undefined) as T };
}

const inWeeks = (weeks: number) => new Date(Date.now() + weeks * 7 * 86_400_000).toISOString();

beforeEach(() => {
  mockSettings.latencyMs = [0, 0];
  resetStore();
  jar.clear();
});

describe("mock admin API", () => {
  it("lists models busiest first and pages through them", async () => {
    const all = await call<Page<ModelSummary>>("GET", "/models");
    expect(all.status).toBe(200);
    expect(all.body.items.length).toBeGreaterThanOrEqual(15);
    expect(all.body.nextCursor).toBeNull();
    const counts = all.body.items.map((m) => m.requests24h);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    expect(all.body.items.find((m) => m.id === "minimax/hailuo-03")?.state).toBe("paused");

    const first = await call<Page<ModelSummary>>("GET", "/models?limit=5");
    expect(first.body.items).toHaveLength(5);
    expect(first.body.nextCursor).not.toBeNull();
    const second = await call<Page<ModelSummary>>("GET", `/models?limit=5&cursor=${first.body.nextCursor}`);
    expect(second.body.items[0].id).toBe(all.body.items[5].id);

    const video = await call<Page<ModelSummary>>("GET", "/models?modality=video&provider=byteplus");
    expect(video.body.items.map((m) => m.id)).toEqual(["bytedance/seedance-2.5"]);
  });

  it("refuses to put a version live without an active route, then promotes it once it has one", async () => {
    const path = "/models/bytedance/seedance-2.5/versions/v3";
    const refused = await call("POST", `${path}/promote`, { to: "live" });
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe("no_route");

    const added = await call<Model>("POST", `${path}/routes`, {
      providerId: "byteplus",
      upstreamModel: "seedance-2-5-pro-251101",
      priority: 1,
      weight: 100,
      cost: { unit: "second", price: 0.13 },
      region: "ap-southeast-1",
      maxConcurrency: null,
    });
    expect(added.status).toBe(200);
    const draft = added.body.versionList.find((v) => v.id === "v3");
    expect(draft?.pricing.tiers.find((t) => t.id === "1080p")?.cost).toBe(0.13);

    const promoted = await call<Model>("POST", `${path}/promote`, { to: "live" });
    expect(promoted.status).toBe(200);
    const live = promoted.body.versionList.find((v) => v.id === "v3");
    expect(live?.status).toBe("live");
    expect(live?.releasedAt).not.toBeNull();
    expect(promoted.body.versions.live).toBe(2);

    const audit = await call<Page<AuditEntry>>("GET", "/audit?action=version&targetId=bytedance/seedance-2.5@v3");
    expect(audit.body.items[0]).toMatchObject({ action: "version.promote", detail: { from: "draft", to: "live" }, ip: "127.0.0.1" });
  });

  it("won't deprecate the default version or reprice a live one", async () => {
    const deprecated = await call("POST", "/models/google/veo-3.1/versions/v2/deprecate", { sunsetAt: inWeeks(6), replacement: null });
    expect(deprecated.status).toBe(422);
    expect(deprecated.body.error.message).toBe("Make another version the default first.");

    const repriced = await call("PATCH", "/models/google/veo-3.1/versions/v2", {
      pricing: { unit: "second", defaultTier: "1080p", tiers: [{ id: "1080p", label: "1080p", price: 0.3 }], input: null, promo: null },
    });
    expect(repriced.status).toBe(422);
    expect(repriced.body.error.code).toBe("version_locked");
  });

  it("publishes an app's draft release and supersedes the live one", async () => {
    const published = await call<App>("POST", "/apps/product-shots/releases/4/publish");
    expect(published.status).toBe(200);
    expect(published.body.liveRelease).toBe(4);
    expect(published.body.draftRelease).toBeNull();
    expect(published.body.releases.find((r) => r.number === 3)?.status).toBe("superseded");
    expect(published.body.models).toContain("google/nano-banana-pro");

    const again = await call("POST", "/apps/product-shots/releases/4/publish");
    expect(again.status).toBe(422);
  });

  it("revokes a key once and answers 409 the second time", async () => {
    const keys = await call<Page<ApiKeyRow>>("GET", "/api-keys?status=active&limit=1");
    const key = keys.body.items[0];
    const customerBefore = await call<Customer>("GET", `/customers/${key.customer.id}`);

    const revoked = await call<ApiKeyRow>("POST", `/api-keys/${key.id}/revoke`, { reason: "Leaked in a support ticket." });
    expect(revoked.status).toBe(200);
    expect(revoked.body.status).toBe("revoked");
    const twice = await call("POST", `/api-keys/${key.id}/revoke`, { reason: "Again." });
    expect(twice.status).toBe(409);

    const customerAfter = await call<Customer>("GET", `/customers/${key.customer.id}`);
    expect(customerAfter.body.keys).toBe(customerBefore.body.keys - 1);
  });

  it("won't take a balance below zero", async () => {
    const customers = await call<Page<CustomerRow>>("GET", "/customers?limit=1");
    const customer = customers.body.items[0];
    const refused = await call("POST", `/customers/${customer.id}/credits`, { amount: -(customer.balance + 100), reason: "Clawback" });
    expect(refused.status).toBe(422);
    expect(refused.body.error.fields?.amount).toBeTruthy();

    const granted = await call<Customer>("POST", `/customers/${customer.id}/credits`, { amount: 25, reason: "Goodwill" });
    expect(granted.body.balance).toBeCloseTo(customer.balance + 25, 6);
    expect(granted.body.ledger[0]).toMatchObject({ kind: "grant", amount: 25, note: "Goodwill", operator: "Anıl Coşaran" });
  });

  it("refunds a request once", async () => {
    const list = await call<Page<RequestRow>>("GET", "/requests?status=succeeded&limit=200");
    const row = list.body.items.find((r) => r.price > 0);
    expect(row).toBeDefined();
    const refunded = await call<RequestDetail>("POST", `/requests/${row?.id}/refund`, { reason: "Blank output." });
    expect(refunded.status).toBe(200);
    expect(refunded.body.refundedAt).not.toBeNull();
    const twice = await call("POST", `/requests/${row?.id}/refund`, { reason: "Again." });
    expect(twice.status).toBe(409);
  });

  it("signs out, refuses requests, and signs in again", async () => {
    expect((await call("POST", "/auth/logout")).status).toBe(204);
    const me = await call("GET", "/me");
    expect(me.status).toBe(401);
    expect(me.body.error.code).toBe("unauthorized");

    expect((await call("POST", "/auth/login", { email: "anil@modelvend.ai", password: "wrong" })).status).toBe(401);
    expect((await call("POST", "/auth/login", { email: "jonas@modelvend.ai", password: MOCK_PASSWORD })).status).toBe(401);
    const login = await call<Operator>("POST", "/auth/login", { email: "deniz@modelvend.ai", password: MOCK_PASSWORD });
    expect(login.status).toBe(200);
    expect((await call<Operator>("GET", "/me")).body.email).toBe("deniz@modelvend.ai");

    // Support can't pause models or read the audit log.
    expect((await call("POST", "/models/google/veo-3.1/pause", { reason: "Test" })).status).toBe(403);
    expect((await call("GET", "/audit")).status).toBe(403);
  });

  it("keeps operators from changing their own access", async () => {
    const self = await call("PATCH", "/operators/op_anil", { role: "custom", permissions: ["catalog.view"] });
    expect(self.status).toBe(422);
    expect(self.body.error.fields?.role).toBeTruthy();
    const created = await call<{ operator: Operator; password: string | null }>("POST", "/operators", {
      email: "Sam@Modelvend.ai",
      name: "Sam",
      role: "custom",
      permissions: ["catalog.publish"],
    });
    expect(created.body.password).toHaveLength(20);
    expect(created.body.operator.permissions).toEqual(["catalog.view", "catalog.edit", "catalog.publish"]);
    const taken = await call("POST", "/operators", { email: "sam@modelvend.ai", name: "Sam", role: "admin" });
    expect(taken.status).toBe(409);
    expect(taken.body.error.fields?.email).toBeTruthy();
  });

  it("answers 404 for unknown routes and IDs", async () => {
    expect((await call("GET", "/nope")).body.error.code).toBe("not_found");
    expect((await call("GET", "/models/google/nope")).status).toBe(404);
  });

  it("builds one overview day per UTC day", async () => {
    const overview = await call<Overview>("GET", "/overview?range=30d");
    expect(overview.body.series).toHaveLength(30);
    expect(overview.body.topModels).toHaveLength(8);
    expect(overview.body.totals.providersDegraded).toBe(1);
    expect((await call("GET", "/overview?range=1y")).status).toBe(400);
  });

  it("seeds the same IDs whatever the time of day", () => {
    const morning = createStore(Date.parse("2026-10-16T06:00:00Z"));
    const evening = createStore(Date.parse("2026-10-16T21:00:00Z"));
    expect(evening.customers.map((c) => c.id).sort()).toEqual(morning.customers.map((c) => c.id).sort());
    expect(evening.apiKeys.map((k) => k.id).sort()).toEqual(morning.apiKeys.map((k) => k.id).sort());
    expect(evening.requests.map((r) => r.id).sort()).toEqual(morning.requests.map((r) => r.id).sort());
  });
});
