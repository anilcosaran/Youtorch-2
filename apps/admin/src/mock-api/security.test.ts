import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Operator, Permission } from "@modelvend/admin-api/auth";
import type { Overview } from "@modelvend/admin-api/overview";
import type { Provider } from "@modelvend/admin-api/providers";
import { MOCK_PASSWORD, handleMock, mockSettings } from ".";
import { LOGIN_MAX_FAILURES, SESSION_COOKIE, SESSION_COOKIE_HTTP, SESSION_TTL_MS } from "./session";
import { resetStore } from "./store";

interface ErrorBody {
  error: { code: string; message: string; fields?: Record<string, string> };
}

interface Reply<T> {
  status: number;
  body: T;
  headers: Headers;
}

/** A browser: its own cookie jar, sent back on every call like a real one would. */
class Browser {
  readonly jar = new Map<string, string>();

  constructor(readonly origin = "http://localhost") {}

  async call<T = ErrorBody>(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<Reply<T>> {
    const url = `${this.origin}/api/admin/v1${path}`;
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
    return { status: response.status, body: (text ? JSON.parse(text) : undefined) as T, headers: response.headers };
  }

  async signIn(email: string, password: string): Promise<Reply<Operator | ErrorBody>> {
    return this.call<Operator | ErrorBody>("POST", "/auth/login", { email, password });
  }

  /** The session cookie's value, whatever its name. */
  get session(): string | undefined {
    return this.jar.get(SESSION_COOKIE_HTTP) ?? this.jar.get(SESSION_COOKIE);
  }
}

const DEMO_PASSWORD = "demo-password-for-tests";

/** A production build with ADMIN_API_MOCK=1: no automatic sign-in, no MOCK_PASSWORD. */
function production(password: string | null = DEMO_PASSWORD) {
  vi.stubEnv("NODE_ENV", "production");
  if (password === null) vi.stubEnv("ADMIN_API_MOCK_PASSWORD", "");
  else vi.stubEnv("ADMIN_API_MOCK_PASSWORD", password);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  resetStore();
}

/** Signs in as the seeded admin and creates an operator with exactly these permissions. */
async function operatorWith(permissions: Permission[], password = "a-strong-password-1"): Promise<{ email: string; password: string }> {
  const admin = new Browser();
  const email = `${permissions.join("-").replaceAll(".", "_") || "none"}@modelvend.ai`;
  const created = await admin.call("POST", "/operators", { email, name: "Test", role: "custom", permissions, password });
  expect(created.status).toBe(200);
  return { email, password };
}

async function signedInWith(permissions: Permission[]): Promise<Browser> {
  const { email, password } = await operatorWith(permissions);
  const browser = new Browser();
  expect((await browser.signIn(email, password)).status).toBe(200);
  return browser;
}

beforeEach(() => {
  mockSettings.latencyMs = [0, 0];
  resetStore();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("mock sessions", () => {
  it("sets a signed, HttpOnly, SameSite=Lax cookie, Secure and __Host- over https", async () => {
    production();
    const plain = new Browser();
    const login = await plain.call("POST", "/auth/login", { email: "anil@modelvend.ai", password: DEMO_PASSWORD });
    expect(login.status).toBe(200);
    const cookie = login.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE_HTTP}=`));
    expect(cookie).toBeDefined();
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).not.toContain("Secure");
    // Not the operator's ID in the clear.
    expect(plain.session).not.toBe("op_anil");

    for (const browser of [new Browser("https://admin.modelvend.ai"), new Browser()]) {
      const proto: Record<string, string> = browser.origin.startsWith("https") ? {} : { "x-forwarded-proto": "https" };
      const secure = await browser.call("POST", "/auth/login", { email: "anil@modelvend.ai", password: DEMO_PASSWORD }, proto);
      const set = secure.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`));
      expect(set).toContain("Secure");
      expect(set).toContain("Path=/");
      expect(set).not.toContain("Domain");
      expect((await browser.call<Operator>("GET", "/me", undefined, proto)).body.email).toBe("anil@modelvend.ai");
      // The __Host- cookie isn't read over plain http.
      if (browser.origin.startsWith("https")) {
        expect((await new Browser().call("GET", "/me", undefined, { cookie: `${SESSION_COOKIE}=${browser.jar.get(SESSION_COOKIE)}` })).status).toBe(401);
      }
    }
  });

  it("refuses a forged or tampered cookie, in development too", async () => {
    const forged = new Browser();
    forged.jar.set(SESSION_COOKIE_HTTP, "op_anil");
    expect((await forged.call("GET", "/me")).status).toBe(401);

    const deniz = new Browser();
    expect((await deniz.signIn("deniz@modelvend.ai", MOCK_PASSWORD)).status).toBe(200);
    const [payload, signature] = (deniz.session ?? "").split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    expect(claims.op).toBe("op_deniz");

    // Same signature, the admin's ID.
    const tampered = new Browser();
    const raised = Buffer.from(JSON.stringify({ ...claims, op: "op_anil" })).toString("base64url");
    tampered.jar.set(SESSION_COOKIE_HTTP, `${raised}.${signature}`);
    expect((await tampered.call("GET", "/me")).status).toBe(401);

    // A later expiry, same signature.
    const extended = new Browser();
    const longer = Buffer.from(JSON.stringify({ ...claims, exp: claims.exp + 1e9 })).toString("base64url");
    extended.jar.set(SESSION_COOKIE_HTTP, `${longer}.${signature}`);
    expect((await extended.call("GET", "/me")).status).toBe(401);

    // A signature cut short or missing.
    for (const value of [`${payload}.${signature.slice(0, 10)}`, payload, `${payload}.`, `${payload}.${signature}.x`]) {
      const broken = new Browser();
      broken.jar.set(SESSION_COOKIE_HTTP, value);
      expect((await broken.call("GET", "/me")).status, value).toBe(401);
    }

    expect((await deniz.call<Operator>("GET", "/me")).body.id).toBe("op_deniz");
  });

  it("ends sessions after 12 hours", async () => {
    production();
    const browser = new Browser();
    expect((await browser.signIn("mara@modelvend.ai", DEMO_PASSWORD)).status).toBe(200);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + SESSION_TTL_MS + 1000);
    expect((await browser.call("GET", "/me")).status).toBe(401);
  });

  it("signs nobody in automatically outside development", async () => {
    expect((await new Browser().call<Operator>("GET", "/me")).body.id).toBe("op_anil");
    production();
    const browser = new Browser();
    const me = await browser.call("GET", "/me");
    expect(me.status).toBe(401);
    expect(me.body.error.code).toBe("unauthorized");
    expect((await browser.call("GET", "/operators")).status).toBe(401);
    expect((await browser.call("POST", "/operators", { email: "eve@modelvend.ai", name: "Eve", role: "admin" })).status).toBe(401);
  });

  it("takes MOCK_PASSWORD only in development", async () => {
    production();
    const browser = new Browser();
    expect((await browser.signIn("anil@modelvend.ai", MOCK_PASSWORD)).status).toBe(401);
    expect((await browser.signIn("anil@modelvend.ai", DEMO_PASSWORD)).status).toBe(200);
    // Nor as the current password when changing it.
    const change = await browser.call("POST", "/me/password", { currentPassword: MOCK_PASSWORD, newPassword: "another-password-1" });
    expect(change.status).toBe(422);
    expect(change.body.error.fields?.currentPassword).toBeTruthy();
  });

  it("locks the seeded accounts when no demo password is set", async () => {
    production(null);
    expect(console.warn).toHaveBeenCalled();
    expect((await new Browser().signIn("anil@modelvend.ai", MOCK_PASSWORD)).status).toBe(401);
    expect((await new Browser().signIn("anil@modelvend.ai", "")).status).toBe(401);
  });

  it("ends the operator's other sessions when they change their password", async () => {
    production();
    const here = new Browser();
    const elsewhere = new Browser();
    expect((await here.signIn("deniz@modelvend.ai", DEMO_PASSWORD)).status).toBe(200);
    expect((await elsewhere.signIn("deniz@modelvend.ai", DEMO_PASSWORD)).status).toBe(200);
    const before = here.session;

    const changed = await here.call("POST", "/me/password", { currentPassword: DEMO_PASSWORD, newPassword: "a-new-password-12" });
    expect(changed.status).toBe(204);
    // This session carries on with a new cookie; the other one and the old cookie are done.
    expect(here.session).not.toBe(before);
    expect((await here.call<Operator>("GET", "/me")).body.id).toBe("op_deniz");
    expect((await elsewhere.call("GET", "/me")).status).toBe(401);
    const replayed = new Browser();
    replayed.jar.set(SESSION_COOKIE_HTTP, before ?? "");
    expect((await replayed.call("GET", "/me")).status).toBe(401);

    expect((await new Browser().signIn("deniz@modelvend.ai", DEMO_PASSWORD)).status).toBe(401);
    expect((await new Browser().signIn("deniz@modelvend.ai", "a-new-password-12")).status).toBe(200);
  });

  it("ends every session of an operator whose password is reset or who is disabled", async () => {
    production();
    const admin = new Browser();
    expect((await admin.signIn("anil@modelvend.ai", DEMO_PASSWORD)).status).toBe(200);

    const deniz = new Browser();
    expect((await deniz.signIn("deniz@modelvend.ai", DEMO_PASSWORD)).status).toBe(200);
    const reset = await admin.call<{ password: string | null }>("POST", "/operators/op_deniz/reset-password", {});
    expect(reset.status).toBe(200);
    expect((await deniz.call("GET", "/me")).status).toBe(401);
    expect((await deniz.signIn("deniz@modelvend.ai", reset.body.password ?? "")).status).toBe(200);
    expect((await deniz.call("GET", "/me")).status).toBe(200);

    expect((await admin.call("PATCH", "/operators/op_deniz", { disabled: true })).status).toBe(200);
    expect((await deniz.call("GET", "/me")).status).toBe(401);
    // Enabling them again doesn't bring the old session back.
    expect((await admin.call("PATCH", "/operators/op_deniz", { disabled: false })).status).toBe(200);
    expect((await deniz.call("GET", "/me")).status).toBe(401);
  });

  it("ends the session on sign-out, even for a copy of the cookie", async () => {
    production();
    const browser = new Browser();
    expect((await browser.signIn("mara@modelvend.ai", DEMO_PASSWORD)).status).toBe(200);
    const copy = new Browser();
    copy.jar.set(SESSION_COOKIE_HTTP, browser.session ?? "");
    expect((await copy.call("GET", "/me")).status).toBe(200);
    expect((await browser.call("POST", "/auth/logout")).status).toBe(204);
    expect(browser.session).toBeUndefined();
    expect((await copy.call("GET", "/me")).status).toBe(401);
  });

  it("throttles sign-in with 429 and Retry-After, even for the right password", async () => {
    const browser = new Browser();
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) {
      expect((await browser.signIn("mara@modelvend.ai", "wrong-password")).status).toBe(401);
    }
    const throttled = await browser.signIn("mara@modelvend.ai", MOCK_PASSWORD);
    expect(throttled.status).toBe(429);
    expect(Number(throttled.headers.get("Retry-After"))).toBeGreaterThan(0);
    // Other accounts are unaffected.
    expect((await browser.signIn("deniz@modelvend.ai", MOCK_PASSWORD)).status).toBe(200);
  });
});

describe("overview permissions", () => {
  const load = async (browser: Browser) => {
    const reply = await browser.call<Overview>("GET", "/overview?range=7d");
    expect(reply.status).toBe(200);
    return reply.body;
  };

  it("gives an admin every figure", async () => {
    const all = await load(new Browser());
    expect(Object.keys(all.totals).sort()).toEqual(
      [
        "activeCustomers7d",
        "cost",
        "deprecatedVersions",
        "errorRate24h",
        "liveModels",
        "margin",
        "pausedModels",
        "providersDegraded",
        "requests24h",
        "revenue",
      ].sort(),
    );
    expect(Object.keys(all.series[0]).sort()).toEqual(["cost", "day", "failed", "requests", "revenue", "signups"]);
    expect(all.topModels?.length).toBeGreaterThan(0);
    expect(all.providers?.length).toBeGreaterThan(0);
  });

  it("leaves out what the operator can't see on its own screen", async () => {
    const catalog = await load(await signedInWith(["catalog.view"]));
    expect(Object.keys(catalog.totals).sort()).toEqual(["deprecatedVersions", "liveModels", "pausedModels", "revenue"]);
    expect(Object.keys(catalog.series[0]).sort()).toEqual(["day", "revenue"]);
    expect(catalog.topModels?.length).toBeGreaterThan(0);
    expect(catalog).not.toHaveProperty("providers");

    const providers = await load(await signedInWith(["providers.view"]));
    expect(Object.keys(providers.totals).sort()).toEqual(["cost", "providersDegraded"]);
    expect(Object.keys(providers.series[0]).sort()).toEqual(["cost", "day"]);
    expect(providers.providers?.length).toBeGreaterThan(0);
    expect(providers).not.toHaveProperty("topModels");

    // Margin needs cost and revenue: with cost alone it would give revenue away.
    const finance = await load(await signedInWith(["customers.view", "providers.view"]));
    expect(Object.keys(finance.totals).sort()).toEqual(["activeCustomers7d", "cost", "margin", "providersDegraded", "revenue"]);
    expect(Object.keys(finance.series[0]).sort()).toEqual(["cost", "day", "revenue", "signups"]);

    const requests = await load(await signedInWith(["requests.view"]));
    expect(Object.keys(requests.totals).sort()).toEqual(["errorRate24h", "requests24h"]);
    expect(Object.keys(requests.series[0]).sort()).toEqual(["day", "failed", "requests"]);

    const audit = await load(await signedInWith(["audit.view"]));
    expect(audit.totals).toEqual({});
    expect(audit.series.every((day) => Object.keys(day).join() === "day")).toBe(true);
    expect(audit).not.toHaveProperty("topModels");
    expect(audit).not.toHaveProperty("providers");
  });
});

describe("provider credentials", () => {
  const fal = async (browser: Browser) =>
    (await browser.call<Provider[]>("GET", "/providers")).body.find((p) => p.id === "fal") as Provider;

  it("needs the key again to move a provider to another endpoint", async () => {
    const admin = new Browser();
    const before = await fal(admin);
    expect(before.credential.configured).toBe(true);

    const refused = await admin.call("PATCH", "/providers/fal", { name: "fal (moved)", baseUrl: "https://attacker.example" });
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe("credential_required");
    expect(refused.body.error.fields?.secret).toBeTruthy();
    // Nothing changed, the name included.
    expect(await fal(admin)).toMatchObject({ name: before.name, baseUrl: before.baseUrl, credential: before.credential });

    const short = await admin.call("PATCH", "/providers/fal", { baseUrl: "https://queue.fal.example", secret: "short" });
    expect(short.status).toBe(422);
    expect(short.body.error.fields?.secret).toBeTruthy();

    // A trailing slash is the same endpoint; other fields need no key.
    const renamed = await admin.call<Provider>("PATCH", "/providers/fal", { name: "fal.ai", baseUrl: `${before.baseUrl}/` });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe("fal.ai");

    const moved = await admin.call<Provider>("PATCH", "/providers/fal", { baseUrl: "https://queue.fal.example/", secret: "fal-key-0000-9z9z" });
    expect(moved.status).toBe(200);
    expect(moved.body.baseUrl).toBe("https://queue.fal.example");
    expect(moved.body.credential).toMatchObject({ configured: true, hint: "…9z9z", source: "console" });
    expect(JSON.stringify(moved.body)).not.toContain("fal-key-0000-9z9z");
  });

  it("moves a provider without a credential freely", async () => {
    const admin = new Browser();
    const moved = await admin.call<Provider>("PATCH", "/providers/modelvend-gpu", { baseUrl: "https://gpu2.internal.modelvend.ai" });
    expect(moved.status).toBe(200);
    expect(moved.body.credential.configured).toBe(false);
  });

  it("lets only providers.edit run a connection check", async () => {
    const viewer = await signedInWith(["providers.view"]);
    expect((await viewer.call("GET", "/providers")).status).toBe(200);
    expect((await viewer.call("POST", "/providers/fal/check")).status).toBe(403);

    const editor = await signedInWith(["providers.edit"]);
    const check = await editor.call<{ ok: boolean }>("POST", "/providers/fal/check");
    expect(check.status).toBe(200);
    expect(check.body.ok).toBe(true);
  });
});
