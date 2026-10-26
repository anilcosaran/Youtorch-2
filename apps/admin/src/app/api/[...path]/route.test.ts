import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const upstream = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv("ADMIN_API_URL", "http://admin-api:8081");
  vi.stubEnv("TRUSTED_PROXY_HOPS", "");
  upstream.mockReset();
  upstream.mockResolvedValue(Response.json({ ok: true }));
  vi.stubGlobal("fetch", upstream);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function request(method: string, path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://admin.modelvend.ai${path}`, {
    method,
    headers: { host: "admin.modelvend.ai", ...headers },
    body: method === "GET" ? undefined : "{}",
  });
}

/** The URL and headers the admin API was called with. */
function forwarded() {
  expect(upstream).toHaveBeenCalledOnce();
  const [url, init] = upstream.mock.calls[0];
  return { url: String(url), headers: new Headers(init?.headers) };
}

describe("admin API proxy", () => {
  it("forwards only /api/admin/v1", async () => {
    for (const path of ["/api/healthz", "/api/admin/v2/me", "/api/admin/v1x"]) {
      expect((await GET(request("GET", path))).status).toBe(404);
    }
    await GET(request("GET", "/api/admin/v1/models?limit=5"));
    expect(forwarded().url).toBe("http://admin-api:8081/admin/v1/models?limit=5");
  });

  it("refuses segments that climb out once decoded", async () => {
    for (const path of ["/api/admin/v1/..%2f..%2fhealthz", "/api/admin/v1/%2E%2E/x", "/api/admin/v1/a%5cb", "/api/admin/v1/%zz"]) {
      expect((await GET(request("GET", path))).status).toBe(404);
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  it("takes changes only from the console's own pages", async () => {
    const path = "/api/admin/v1/operators";
    const refused: Record<string, string>[] = [
      {},
      { "sec-fetch-site": "cross-site" },
      // The customer console is same-site, not same-origin.
      { "sec-fetch-site": "same-site", origin: "https://app.modelvend.ai" },
      { origin: "https://app.modelvend.ai" },
      { origin: "null" },
    ];
    for (const headers of refused) {
      const response = await POST(request("POST", path, headers));
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("cross_origin");
    }
    expect(upstream).not.toHaveBeenCalled();

    expect((await POST(request("POST", path, { "sec-fetch-site": "same-origin" }))).status).toBe(200);
    expect((await POST(request("POST", path, { origin: "https://admin.modelvend.ai" }))).status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it("sends only the headers the admin API reads, with an address the browser can't choose", async () => {
    await GET(
      request("GET", "/api/admin/v1/me", {
        cookie: "session=abc",
        accept: "application/json",
        "x-forwarded-for": "6.6.6.6, 10.0.0.7",
        "x-forwarded-host": "evil.example",
        "x-real-ip": "6.6.6.6",
        forwarded: "for=6.6.6.6",
        authorization: "Bearer x",
      }),
    );
    const { headers } = forwarded();
    expect(headers.get("cookie")).toBe("session=abc");
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("x-forwarded-for")).toBe("10.0.0.7");
    expect(headers.get("x-forwarded-host")).toBe("admin.modelvend.ai");
    expect(headers.get("x-forwarded-proto")).toBe("http");
    for (const name of ["x-real-ip", "forwarded", "authorization", "host"]) expect(headers.has(name)).toBe(false);
  });

  it("counts TRUSTED_PROXY_HOPS from the right of X-Forwarded-For", async () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "2");
    await GET(request("GET", "/api/admin/v1/me", { "x-forwarded-for": "6.6.6.6, 203.0.113.9, 10.0.0.7" }));
    expect(forwarded().headers.get("x-forwarded-for")).toBe("203.0.113.9");
  });

  it("leaves the address out when it isn't one", async () => {
    await GET(request("GET", "/api/admin/v1/me", { "x-forwarded-for": "not-an-ip" }));
    expect(forwarded().headers.has("x-forwarded-for")).toBe(false);
  });
});
