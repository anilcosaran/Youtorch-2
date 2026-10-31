import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import type { ApiKeyRow } from "@modelvend/admin-api/api-keys";
import type { App } from "@modelvend/admin-api/apps";
import type { AuditEntry } from "@modelvend/admin-api/audit";
import type { Operator } from "@modelvend/admin-api/auth";
import type { Page } from "@modelvend/admin-api/client";
import type { Customer, CustomerRow, LedgerEntry } from "@modelvend/admin-api/customers";
import type { Model, ModelSummary } from "@modelvend/admin-api/models";
import type { Overview } from "@modelvend/admin-api/overview";
import type { TaskDetail, TaskRow } from "@modelvend/admin-api/tasks";
import { MOCK_PASSWORD, handleMock, mockSettings } from ".";
import { createStore } from "./seed";
import { resetStore } from "./store";

interface ErrorBody {
  error: { code: string; message: string; fields?: Record<string, string> };
}

/** Cookies the mock set, sent back like a browser would. */
const jar = new Map<string, string>();

async function call<T = ErrorBody>(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<{ status: number; body: T }> {
  const url = `http://localhost/api/admin/v1${path}`;
  const headers = new Headers(extra);
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

beforeEach(() => {
  mockSettings.latencyMs = [0, 0];
  resetStore();
  jar.clear();
});

describe("mock admin API", () => {
  it("lists models busiest first and pages through them", async () => {
    const all = await call<Page<ModelSummary>>("GET", "/models");
    expect(all.status).toBe(200);
    expect(all.body.items.length).toBeGreaterThanOrEqual(8);
    expect(all.body.nextCursor).toBeNull();
    const counts = all.body.items.map((m) => m.tasks24h);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    expect(all.body.items.find((m) => m.id === "openai/sora-2")?.state).toBe("paused");

    const first = await call<Page<ModelSummary>>("GET", "/models?limit=5");
    expect(first.body.items).toHaveLength(5);
    expect(first.body.nextCursor).not.toBeNull();
    const second = await call<Page<ModelSummary>>("GET", `/models?limit=5&cursor=${first.body.nextCursor}`);
    expect(second.body.items[0].id).toBe(all.body.items[5].id);

    const video = await call<Page<ModelSummary>>("GET", "/models?modality=video&provider=kling");
    expect(video.body.items.map((m) => m.id)).toEqual(["kling/kling-3"]);
  });

  it("refuses to put a version live without an active route, then publishes it once it has one", async () => {
    const path = "/models/openai/sora-2/versions/v2";
    const refused = await call("POST", `${path}/publish`, {});
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe("no_route");

    const { revision } = (await call<Model>("GET", "/models/openai/sora-2")).body;
    const added = await call<Model>(
      "POST",
      `${path}/routes`,
      {
        providerId: "openai",
        upstreamModel: "sora-2-1",
        priority: 1,
        weight: 100,
        tierCosts: { "720p": "0.1", "1080p-pro": "0.4" },
        region: "us",
        maxConcurrency: null,
      },
      { "If-Match": String(revision) },
    );
    expect(added.status).toBe(200);
    const draft = added.body.versionList.find((v) => v.id === "v2");
    expect(draft?.pricing.tiers.find((t) => t.id === "1080p-pro")?.cost).toBe("0.4");

    const published = await call<Model>("POST", `${path}/publish`, {});
    expect(published.status).toBe(200);
    const live = published.body.versionList.find((v) => v.id === "v2");
    expect(live?.status).toBe("live");
    expect(live?.releasedAt).not.toBeNull();
    expect(published.body.versions.live).toBe(2);

    const audit = await call<Page<AuditEntry>>("GET", "/audit?action=version&targetId=openai/sora-2@v2");
    expect(audit.body.items[0]).toMatchObject({ action: "version.publish", ip: "127.0.0.1" });
  });

  it("won't reprice a live version", async () => {
    const { revision } = (await call<Model>("GET", "/models/google/veo-3.1")).body;
    const repriced = await call(
      "PATCH",
      "/models/google/veo-3.1/versions/v2",
      { pricing: { unit: "second", defaultTier: "1080p", tierField: null, tierValues: {}, tiers: [{ id: "1080p", label: "1080p", price: "0.3" }], input: null, promo: null } },
      { "If-Match": String(revision) },
    );
    expect(repriced.status).toBe(422);
    expect(repriced.body.error.code).toBe("version_locked");
  });

  it("publishes an app's draft release and supersedes the live one", async () => {
    const published = await call<App>("POST", "/apps/product-shots/releases/2/publish", { reason: "Trying GPT Image." });
    expect(published.status).toBe(200);
    expect(published.body.liveRelease).toBe(2);
    expect(published.body.draftRelease).toBeNull();
    expect(published.body.releases.find((r) => r.number === 1)?.status).toBe("superseded");
    expect(published.body.models).toContain("openai/gpt-image-1.5");

    const again = await call("POST", "/apps/product-shots/releases/2/publish", {});
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

  it("won't take a balance below zero without asking", async () => {
    const customers = await call<Page<CustomerRow>>("GET", "/customers?limit=1");
    const customer = customers.body.items[0];
    const refused = await call("POST", `/customers/${customer.id}/credits`, { amountMicros: -(customer.balanceMicros + 100_000_000), reason: "Clawback" });
    expect(refused.status).toBe(422);
    expect(refused.body.error.fields?.amountMicros).toBeTruthy();

    const granted = await call<Customer>("POST", `/customers/${customer.id}/credits`, { amountMicros: 25_000_000, kind: "gift", reason: "Goodwill" });
    expect(granted.body.balanceMicros).toBe(customer.balanceMicros + 25_000_000);
    const ledger = await call<Page<LedgerEntry>>("GET", `/customers/${customer.id}/ledger?limit=1`);
    expect(ledger.body.items[0]).toMatchObject({ kind: "grant", amountMicros: 25_000_000, note: "Goodwill", operator: "Anıl Coşaran" });
  });

  it("refunds a task once", async () => {
    const list = await call<Page<TaskRow>>("GET", "/tasks?status=succeeded&limit=200");
    const row = list.body.items.find((r) => r.amountMicros > 0);
    expect(row).toBeDefined();
    const refunded = await call<TaskDetail>("POST", `/tasks/${row?.id}/refund`, { reason: "Blank output." });
    expect(refunded.status).toBe(200);
    expect(refunded.body.refundedAt).not.toBeNull();
    const twice = await call("POST", `/tasks/${row?.id}/refund`, { reason: "Again." });
    expect(twice.status).toBe(409);
  });

  it("signs out, refuses calls, and signs in again", async () => {
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

  it("keeps operators.manage from making admins or taking over other operators", async () => {
    const manager = await call<{ operator: Operator }>("POST", "/operators", {
      email: "kit@modelvend.ai",
      name: "Kit",
      role: "custom",
      permissions: ["operators.manage"],
    });
    await call("POST", "/auth/logout");
    expect((await call("POST", "/auth/login", { email: "kit@modelvend.ai", password: MOCK_PASSWORD })).status).toBe(200);
    const kit = manager.body.operator.id;

    const admin = await call("POST", "/operators", { email: "eve@modelvend.ai", name: "Eve", role: "admin" });
    expect(admin.status).toBe(403);
    const wider = await call("POST", "/operators", { email: "eve@modelvend.ai", name: "Eve", role: "custom", permissions: ["catalog.view"] });
    expect(wider.status).toBe(403);
    const peer = await call<{ operator: Operator }>("POST", "/operators", {
      email: "lee@modelvend.ai",
      name: "Lee",
      role: "custom",
      permissions: ["operators.manage"],
    });
    expect(peer.status).toBe(200);
    expect((await call("PATCH", `/operators/${peer.body.operator.id}`, { role: "admin" })).status).toBe(403);
    expect((await call("PATCH", `/operators/${peer.body.operator.id}`, { name: "Lee Park" })).status).toBe(200);

    // Admins and wider operators are out of reach: no disabling, no password reset.
    expect((await call("PATCH", "/operators/op_anil", { disabled: true })).status).toBe(403);
    expect((await call("POST", "/operators/op_anil/reset-password", { password: "takeover-1234" })).status).toBe(403);
    expect((await call("POST", "/operators/op_mara/reset-password", {})).status).toBe(403);
    // Your own password needs the current one, through /me/password.
    const own = await call("POST", `/operators/${kit}/reset-password`, { password: "takeover-1234" });
    expect(own.status).toBe(422);
    expect(own.body.error.code).toBe("own_password");
  });

  it("refuses changes that aren't JSON", async () => {
    const request = new NextRequest("http://localhost/api/admin/v1/operators", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify({ email: "eve@modelvend.ai", name: "Eve", role: "admin" }),
    });
    const response = await handleMock(request, "/admin/v1/operators");
    expect(response.status).toBe(415);
    expect((await call<Operator[]>("GET", "/operators")).body.some((o) => o.email === "eve@modelvend.ai")).toBe(false);
  });

  it("answers 404 for unknown routes and IDs", async () => {
    expect((await call("GET", "/nope")).body.error.code).toBe("not_found");
    expect((await call("GET", "/models/google/nope")).status).toBe(404);
  });

  it("builds one overview day per UTC day", async () => {
    const overview = await call<Overview>("GET", "/overview?range=30d");
    expect(overview.body.series).toHaveLength(30);
    expect(overview.body.topModels?.length).toBeGreaterThanOrEqual(5);
    expect(overview.body.totals.providersDegraded).toBe(1);
    expect((await call("GET", "/overview?range=1y")).status).toBe(400);
  });

  it("seeds the same IDs whatever the time of day", () => {
    const morning = createStore(Date.parse("2026-10-16T06:00:00Z"));
    const evening = createStore(Date.parse("2026-10-16T21:00:00Z"));
    expect(evening.customers.map((c) => c.id).sort()).toEqual(morning.customers.map((c) => c.id).sort());
    expect(evening.apiKeys.map((k) => k.id).sort()).toEqual(morning.apiKeys.map((k) => k.id).sort());
    expect(evening.tasks.map((t) => t.id).sort()).toEqual(morning.tasks.map((t) => t.id).sort());
  });
});
