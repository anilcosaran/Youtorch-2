import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import type { Model } from "@modelvend/admin-api/models";
import { ROUTES, handleMock, mockSettings } from ".";
import { resetStore } from "./store";

/*
 * Holds the mock to api/admin.yaml: every call below is checked against the spec, its answer must be a documented
 * status with exactly the documented fields, and every operation not marked for a later phase must be exercised.
 * The panel talks to this mock until the Go server replaces it, and then this is the behaviour that server owes.
 */

type Json = Record<string, unknown>;

interface Operation extends Json {
  operationId: string;
  "x-phase"?: number;
  requestBody?: { content: Record<string, { schema: Json }> };
  responses: Record<string, Json>;
}

const spec = parse(readFileSync(resolve(process.cwd(), "../../api/admin.yaml"), "utf8")) as {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, Json>; responses: Record<string, Json> };
};

const METHODS = ["get", "post", "put", "patch", "delete"];

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);

const refName = (ref: string) => ref.replace("#/components/schemas/", "");

/**
 * The schema with `allOf` flattened and undocumented properties refused. `allOf` has to go first: each branch sees
 * only its own properties, so refusing the rest in a branch would refuse the other branches'.
 */
function strict(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(strict);
  if (!isObject(schema)) return schema;
  const out: Json = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "$ref") out.$ref = `admin#/components/schemas/${refName(value as string)}`;
    else if (key === "properties" && isObject(value)) out.properties = Object.fromEntries(Object.entries(value).map(([name, property]) => [name, strict(property)]));
    else if (key === "allOf") continue;
    else out[key] = strict(value);
  }
  if (Array.isArray(schema.allOf)) {
    for (const branch of schema.allOf as Json[]) {
      const part = (typeof branch.$ref === "string" ? strict(spec.components.schemas[refName(branch.$ref)]) : strict(branch)) as Json;
      out.properties = { ...(out.properties as Json), ...(part.properties as Json) };
      out.required = [...((out.required as string[]) ?? []), ...((part.required as string[]) ?? [])];
    }
    out.type = "object";
  }
  if (out.properties && out.additionalProperties === undefined) out.additionalProperties = false;
  return out;
}

const ajv = new Ajv2020({ strict: false, allErrors: true, logger: false });
ajv.addFormat("date-time", (value: string) => !Number.isNaN(Date.parse(value)));
ajv.addSchema({ $id: "admin", components: { schemas: strict(spec.components.schemas) } });

const compiled = new Map<object, ValidateFunction>();
function validator(schema: Json): ValidateFunction {
  let validate = compiled.get(schema);
  if (!validate) {
    validate = ajv.compile(strict(schema) as object);
    compiled.set(schema, validate);
  }
  return validate;
}

function check(what: string, schema: Json, value: unknown) {
  const validate = validator(schema);
  expect(validate(value), `${what}: ${ajv.errorsText(validate.errors, { dataVar: "" })}`).toBe(true);
}

const staticParts = (path: string) => path.split("/").filter((part) => part && !part.startsWith("{")).length;

/** The documented path a real one falls under; the most literal wins, so `/models/import` beats `/models/{a}/{b}`. */
function templateFor(path: string): string | null {
  const parts = path.split("?")[0].split("/");
  const matches = Object.keys(spec.paths).filter((template) => {
    const expected = template.split("/");
    return expected.length === parts.length && expected.every((part, i) => part.startsWith("{") || part === parts[i]);
  });
  return matches.sort((a, b) => staticParts(b) - staticParts(a))[0] ?? null;
}

const exercised = new Set<string>();
const jar = new Map<string, string>();

interface Reply<T> {
  status: number;
  body: T;
}

/** One call, held to the spec. Bodies are checked only on success: a refused one is often refused for being wrong. */
async function call<T = Json>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Reply<T>> {
  const template = templateFor(path);
  expect(template, `${path} isn't in api/admin.yaml`).not.toBeNull();
  const operation = spec.paths[template as string][method.toLowerCase()];
  expect(operation, `${method} ${template} isn't in api/admin.yaml`).toBeDefined();

  const url = `http://localhost/api/admin/v1${path}`;
  const sent = new Headers(headers);
  if (jar.size > 0) sent.set("cookie", [...jar].map(([name, value]) => `${name}=${value}`).join("; "));
  if (method !== "GET") sent.set("content-type", "application/json");
  const request = new NextRequest(url, { method, headers: sent, body: body === undefined ? undefined : JSON.stringify(body) });
  const response = await handleMock(request, new URL(url).pathname.replace(/^\/api/, ""));
  for (const cookie of response.headers.getSetCookie()) {
    const [pair, ...attributes] = cookie.split(";");
    const at = pair.indexOf("=");
    if (attributes.some((a) => a.trim().toLowerCase() === "max-age=0")) jar.delete(pair.slice(0, at));
    else jar.set(pair.slice(0, at), pair.slice(at + 1));
  }

  const text = await response.text();
  const parsed = (text ? JSON.parse(text) : undefined) as T;
  const name = `${operation.operationId} ${response.status}`;
  const documented = operation.responses[String(response.status)];
  expect(documented, `${name} isn't documented: ${text.slice(0, 300)}`).toBeDefined();

  const reference = documented.$ref as string | undefined;
  const answer = reference ? spec.components.responses[reference.split("/").pop() as string] : documented;
  const schema = (answer.content as Record<string, { schema: Json }> | undefined)?.["application/json"]?.schema;
  if (schema) check(name, schema, parsed);
  if (response.ok) {
    exercised.add(operation.operationId);
    const request = operation.requestBody?.content["application/json"]?.schema;
    if (request && body !== undefined) check(`${operation.operationId} request`, request, body);
  }
  return { status: response.status, body: parsed };
}

async function ok<T = Json>(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
  const reply = await call<T>(method, path, body, headers);
  expect(reply.status, `${method} ${path}: ${JSON.stringify(reply.body)}`).toBeLessThan(300);
  return reply.body;
}

const inWeeks = (weeks: number) => new Date(Date.now() + weeks * 7 * 86_400_000).toISOString();
const matching = (revision: number) => ({ "If-Match": String(revision) });

const VEO = "/models/google/veo-3.1";

beforeAll(() => {
  mockSettings.latencyMs = [0, 0];
  resetStore();
});

describe("the mock admin API against api/admin.yaml", () => {
  it("documents what is served and serves what is documented", () => {
    const documented = Object.entries(spec.paths).flatMap(([path, item]) =>
      METHODS.filter((method) => item[method]).map((method) => ({ key: `${method.toUpperCase()} ${path}`, phase: item[method]["x-phase"] })),
    );
    const key = (method: string, pattern: string) => `${method} ${pattern.replace(/:(\w+)/g, "{$1}")}`;
    const served = ROUTES.map((route) => key(route.method, route.pattern));
    expect(served.filter((route) => !documented.some((d) => d.key === route))).toEqual([]);
    expect(documented.filter((d) => d.phase === undefined && !served.includes(d.key)).map((d) => d.key)).toEqual([]);
    expect(documented.filter((d) => d.phase !== undefined && served.includes(d.key)).map((d) => d.key)).toEqual([]);
  });

  it("answers every operation as documented", async () => {
    // Auth, operators.
    await ok("POST", "/auth/login", { email: "anil@modelvend.ai", password: "modelvend-dev" });
    await ok("GET", "/me");
    await ok("GET", "/permissions");
    await ok("GET", "/operators");
    const created = await ok<{ operator: { id: string } }>("POST", "/operators", {
      email: "sam@modelvend.ai",
      name: "Sam",
      role: "custom",
      permissions: ["catalog.view"],
    });
    await ok("PATCH", `/operators/${created.operator.id}`, { name: "Sam Lee" });
    await ok("POST", `/operators/${created.operator.id}/reset-password`, {});
    await ok("POST", "/me/password", { currentPassword: "modelvend-dev", newPassword: "another-strong-password" });
    await ok("POST", "/auth/logout");
    expect((await call("GET", "/me")).status).toBe(401);
    expect((await call("POST", "/auth/login", { email: "anil@modelvend.ai", password: "wrong" })).status).toBe(401);
    await ok("POST", "/auth/login", { email: "anil@modelvend.ai", password: "another-strong-password" });
    await ok("GET", "/audit?limit=20");
    expect((await call("GET", "/overview?range=1y")).status).toBe(400);
    for (const range of ["7d", "30d", "90d"]) await ok("GET", `/overview?range=${range}`);

    // Settings.
    const settings = await ok<{ minMargin: number }>("GET", "/settings");
    await ok("PATCH", "/settings", { reason: "Testing", minMargin: settings.minMargin });
    expect((await call("PATCH", "/settings", { reason: "Testing", minMargin: 2 })).status).toBe(422);

    // Models, from a new one through a draft to retirement.
    await ok("GET", "/models?limit=5");
    const model = await ok<Model>("POST", "/models", { publisher: "acme", slug: "clip-1", name: "Clip 1", modality: "video", author: "Acme" });
    expect(model).toMatchObject({ visibility: "private", disclosure: "open", author: "Acme" });
    expect((await call("POST", "/models", { publisher: "acme", slug: "clip-1", name: "Again", modality: "video" })).status).toBe(409);
    const CLIP = "/models/acme/clip-1";
    expect((await call("GET", "/models/acme/nope")).status).toBe(404);
    await ok("GET", CLIP);
    expect((await call("PATCH", CLIP, { name: "Stale" }, matching(model.revision + 5))).status).toBe(409);
    let current = await ok<Model>(
      "PATCH",
      CLIP,
      { name: "Clip One", disclosure: "open", capabilities: ["camera-control"], maxOutput: { width: 1920, height: 1080, seconds: 10 }, gallery: [{ url: "https://example.com/a.mp4", kind: "video", caption: "Rain" }] },
      matching(model.revision),
    );
    current = await ok<Model>(
      "PATCH",
      `${CLIP}/versions/v1`,
      {
        label: "1.0",
        changelog: "First.",
        inputSchema: { type: "object", properties: { prompt: { type: "string" }, resolution: { type: "string", enum: ["720p", "full"] }, image_url: { type: "string" } }, required: ["prompt"] },
        outputSchema: { type: "object", properties: { video: { type: "string" } } },
        routing: { strategy: "priority", fallbacks: true, maxAttempts: 2, timeoutSeconds: 600 },
        pricing: {
          unit: "second",
          defaultTier: "720p",
          tierField: "resolution",
          tierValues: { full: "1080p" },
          tiers: [
            { id: "720p", label: "720p", price: "0.10" },
            { id: "1080p", label: "1080p", price: "0.20" },
          ],
          input: { unit: "image", price: "0.01", field: "image_url" },
          promo: null,
        },
      },
      matching(current.revision),
    );
    expect((await call("POST", `${CLIP}/versions/v1/publish`, {})).status).toBe(422);
    current = await ok<Model>(
      "POST",
      `${CLIP}/versions/v1/routes`,
      { providerId: "kling", upstreamModel: "kling-v3-1", tierCosts: { "720p": "0.05", "1080p": "0.10" }, mapping: { prompt: "prompt" }, transform: null },
      matching(current.revision),
    );
    expect(current.versionList[0].pricing.tiers.map((tier) => tier.cost)).toEqual(["0.05", "0.10"]);
    const route = current.versionList[0].routes[0];
    current = await ok<Model>("PATCH", `${CLIP}/versions/v1/routes/${route.id}`, { maxConcurrency: 10, status: "active" }, matching(current.revision));
    current = await ok<Model>(
      "POST",
      `${CLIP}/versions/v1/routes`,
      { providerId: "google", upstreamModel: "extra", tierCosts: { "720p": "0.06" } },
      matching(current.revision),
    );
    const extra = current.versionList[0].routes.find((r) => r.upstreamModel === "extra");
    current = await ok<Model>("DELETE", `${CLIP}/versions/v1/routes/${extra?.id}`, undefined, matching(current.revision));
    current = await ok<Model>("POST", `${CLIP}/versions/v1/publish`, {});
    expect(current).toMatchObject({ defaultVersion: "v1" });
    await ok("POST", `${CLIP}/pause`, { reason: "Testing" });
    await ok("POST", `${CLIP}/resume`);
    await ok("POST", `${CLIP}/versions`, { id: "v2", label: "2.0", from: "v1" });
    await ok("POST", `${CLIP}/versions/v2/publish`, {});
    await ok("POST", `${CLIP}/versions/v2/default`);
    await ok("POST", `${CLIP}/versions/v1/deprecate`, { sunsetAt: inWeeks(6), replacement: "v2" });
    expect((await call("POST", `${CLIP}/versions/v1/retire`)).status).toBe(422);

    const store = resetStore();
    jar.clear();
    const veo = store.models.find((m) => m.id === "google/veo-3.1")?.versionList.find((v) => v.id === "v1");
    if (!veo) throw new Error("seed changed");
    veo.sunsetAt = new Date(Date.now() - 86_400_000).toISOString();
    await ok("POST", `${VEO}/versions/v1/retire`);

    // Apps.
    await ok("GET", "/apps");
    await ok("GET", "/apps/background-remover");
    await ok("POST", "/apps", { slug: "caption", name: "Caption", tagline: "", category: "image" });
    await ok("PATCH", "/apps/caption", {
      description: "Captions.",
      inputSchema: { type: "object", properties: { image: { type: "string" } } },
      outputSchema: { type: "object", properties: { image: { type: "string" } } },
    });
    await ok("PATCH", "/apps/caption/releases/1", {
      steps: [{ id: "render", stage: "Rendering", model: "openai/gpt-image-1.5@v1", input: { prompt: "{{input.image}}" } }],
      stages: ["Rendering"],
      outputMap: { image: "{{steps.render.output.images}}" },
      priceMicros: 5_000_000,
      notes: "First.",
    });
    await ok("POST", "/apps/caption/releases/1/publish", {});
    await ok("POST", "/apps/caption/pause", { reason: "Testing" });
    await ok("POST", "/apps/caption/resume");
    await ok("POST", "/apps/caption/releases");
    await ok("POST", "/apps/background-remover/rollback", { release: 1 });

    // Providers.
    await ok("GET", "/providers");
    await ok("POST", "/providers", { id: "acme", name: "Acme", kind: "first_party", adapter: "fake", baseUrl: "https://acme.example", regions: ["us"], whiteLabelAllowed: true });
    expect((await call("POST", "/providers/acme/enable")).status).toBe(422);
    await ok("PUT", "/providers/acme/credential", { secret: "a-long-enough-secret" });
    await ok("POST", "/providers/acme/enable");
    await ok("PATCH", "/providers/acme", { name: "Acme AI", licenseNotes: "Resale allowed.", limits: { concurrency: 5, requestsPerMinute: null } });
    await ok("POST", "/providers/acme/check");
    await ok("POST", "/providers/acme/pause", { reason: "Testing" });
    await ok("POST", "/providers/acme/resume");
    await ok("POST", "/providers/acme/disable", { reason: "Testing" });

    // Customers.
    const customers = await ok<{ items: { id: string }[]; nextCursor: string | null }>("GET", "/customers?limit=5");
    const { id } = customers.items[0];
    await ok("GET", `/customers/${id}`);
    await ok("GET", `/customers/${id}/ledger?limit=5`);
    await ok("PATCH", `/customers/${id}`, { limits: { requestsPerMinute: 500, dailySpendMicros: null }, reason: "Asked by email." });
    await ok("POST", `/customers/${id}/credits`, { amountMicros: 25_000_000, kind: "gift", reason: "Goodwill" });
    expect((await call("POST", `/customers/${id}/credits`, { amountMicros: -999_000_000_000, reason: "Clawback" })).status).toBe(422);
    await ok("POST", `/customers/${id}/credits`, { amountMicros: -999_000_000_000, reason: "Chargeback", confirmNegative: true });
    await ok("POST", `/customers/${id}/suspend`, { reason: "Testing" });
    await ok("POST", `/customers/${id}/resume`);

    // API keys.
    const keys = await ok<{ items: { id: string }[] }>("GET", "/api-keys?status=active&limit=5");
    await ok("PATCH", `/api-keys/${keys.items[0].id}`, { spendLimitMicros: 75_000_000 });
    await ok("POST", `/api-keys/${keys.items[0].id}/revoke`, { reason: "Leaked." });
    expect((await call("POST", `/api-keys/${keys.items[0].id}/revoke`, { reason: "Again." })).status).toBe(409);

    // Tasks, each status and an app run with its steps.
    const tasks = await ok<{ items: { id: string; app: string | null; status: string; amountMicros: number }[] }>("GET", "/tasks?limit=200");
    for (const task of tasks.items.slice(0, 40)) await ok("GET", `/tasks/${task.id}`);
    const run = tasks.items.find((task) => task.app !== null);
    if (!run) throw new Error("no app run in the seed");
    const detail = await ok<{ model: string | null; steps: { parentId: string | null }[] }>("GET", `/tasks/${run.id}`);
    expect(detail.model).toBeNull();
    expect(detail.steps.length).toBeGreaterThan(0);
    expect(detail.steps.every((step) => step.parentId === run.id)).toBe(true);
    const paid = tasks.items.find((task) => task.status === "succeeded" && task.amountMicros > 0);
    await ok("POST", `/tasks/${paid?.id}/refund`, { reason: "Blank output." });
    expect((await call("POST", `/tasks/${paid?.id}/refund`, { reason: "Again." })).status).toBe(409);

    // Every operation due now was called, and answered with success at least once.
    const due = Object.values(spec.paths).flatMap((item) =>
      METHODS.map((method) => item[method]).filter((operation): operation is Operation => Boolean(operation) && operation["x-phase"] === undefined),
    );
    expect(due.map((operation) => operation.operationId).filter((name) => !exercised.has(name))).toEqual([]);
  });
});
