import { isIP } from "node:net";
import type { NextRequest } from "next/server";
import { handleMock } from "@/mock-api";

/**
 * Forwards `/api/admin/v1/*` to the admin API (`/api/admin/v1/me` → `${ADMIN_API_URL}/admin/v1/me`).
 * ADMIN_API_URL is read on every request, not at build time, so one image serves
 * every deployment. Without it, development (or ADMIN_API_MOCK=1) answers from
 * the in-memory mock in `src/mock-api`, which implements the same contract.
 *
 * Nothing outside `/admin/v1` is forwarded, so the admin server's other routes
 * (health checks, metrics) stay internal. Changes are taken only from this
 * console's own pages, and the admin API gets only the headers it reads, with
 * the operator's address worked out here instead of copied from the browser.
 */

const PREFIX = "/admin/v1";

// What the admin API reads from the browser's request. Everything else stays
// here, above all the browser's own X-Forwarded-* and X-Real-IP.
const FORWARDED_REQUEST = ["accept", "accept-language", "content-type", "cookie", "if-match", "user-agent"];
// fetch decodes compressed bodies, so the encoding and length no longer apply.
const DROPPED_RESPONSE = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-encoding",
  "content-length",
  "set-cookie",
]);

// Bodies are JSON (files go straight to storage), so anything larger is refused
// here instead of being buffered in memory.
const MAX_BODY_BYTES = 2 * 1024 * 1024;

const HOST = /^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(:\d{1,5})?$/i;

/** The request body, or null when it is larger than MAX_BODY_BYTES. */
async function readBody(request: NextRequest): Promise<ArrayBuffer | null> {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (request.body) {
    const reader = request.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}

function apiBase(): string | null {
  const url = process.env.ADMIN_API_URL?.trim();
  return url ? url.replace(/\/+$/, "") : null;
}

const mockAllowed = () => process.env.NODE_ENV !== "production" || process.env.ADMIN_API_MOCK === "1";

/**
 * The admin API path for this request, or null when it is outside /admin/v1 or
 * has a segment that could climb out of it once decoded (`..`, `%2e%2e`, `%2f`).
 */
function adminPath(request: NextRequest): string | null {
  const path = request.nextUrl.pathname.replace(/^\/api/, "");
  if (path !== PREFIX && !path.startsWith(`${PREFIX}/`)) return null;
  for (const segment of path.split("/")) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return null;
    }
    if (decoded === "." || decoded === ".." || /[/\\]/.test(decoded)) return null;
  }
  return path;
}

/**
 * Whether a request that changes something came from this console's own pages.
 * Browsers send Sec-Fetch-Site, which no page can set; older ones send only
 * Origin, which must name the host the browser asked for. SameSite cookies
 * aren't enough on their own: the customer console is on the same site.
 */
function fromOwnPages(request: NextRequest): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site !== null) return site === "same-origin";
  const origin = request.headers.get("origin");
  if (!origin) return false;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0].trim();
  return host === request.headers.get("host") || host === forwardedHost;
}

/**
 * The operator's address. Each of the TRUSTED_PROXY_HOPS proxies in front of
 * the console (default 1: the SSO proxy or ingress) appends the address it was
 * called from to X-Forwarded-For, so the operator's is that many entries from
 * the right; anything further left came from the browser and can say anything.
 * With nothing in front, Next.js fills the header from the socket.
 */
function clientAddress(request: NextRequest): string | null {
  const configured = Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "", 10);
  const hops = Number.isInteger(configured) && configured > 0 ? configured : 1;
  const entries = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const address = entries[Math.max(entries.length - hops, 0)];
  return address && isIP(address) ? address : null;
}

/** The headers sent to the admin API: the ones it reads, plus where the request came from. */
function upstreamHeaders(request: NextRequest): Headers {
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  const address = clientAddress(request);
  if (address) headers.set("x-forwarded-for", address);
  const host = request.headers.get("host");
  if (host && HOST.test(host)) headers.set("x-forwarded-host", host);
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  headers.set(
    "x-forwarded-proto",
    proto === "http" || proto === "https" ? proto : request.nextUrl.protocol.replace(/:$/, ""),
  );
  return headers;
}

async function forward(request: NextRequest): Promise<Response> {
  const path = adminPath(request);
  if (path === null) {
    return Response.json({ error: { code: "not_found", message: "There's no such endpoint." } }, { status: 404 });
  }
  const changes = request.method !== "GET" && request.method !== "HEAD";
  if (changes && !fromOwnPages(request)) {
    return Response.json(
      { error: { code: "cross_origin", message: "Changes are only accepted from this console's own pages." } },
      { status: 403 },
    );
  }

  const base = apiBase();
  if (!base) {
    if (mockAllowed()) return handleMock(request, path);
    return Response.json(
      { error: { code: "unavailable", message: "ADMIN_API_URL isn't set, so the console has no admin API." } },
      { status: 502 },
    );
  }
  const target = `${base}${path}${request.nextUrl.search}`;

  const body = changes ? await readBody(request) : undefined;
  if (body === null) {
    return Response.json(
      { error: { code: "payload_too_large", message: "That request is too large." } },
      { status: 413 },
    );
  }
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers: upstreamHeaders(request),
      body,
      redirect: "manual",
      cache: "no-store",
    });
  } catch {
    return Response.json(
      { error: { code: "unavailable", message: "The server can't be reached right now." } },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, name) => {
    if (!DROPPED_RESPONSE.has(name)) responseHeaders.set(name, value);
  });
  for (const cookie of upstream.headers.getSetCookie()) {
    responseHeaders.append("set-cookie", cookie);
  }

  const empty = request.method === "HEAD" || upstream.status === 204 || upstream.status === 304;
  return new Response(empty ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

// No OPTIONS: the console calls its own origin, so there is no CORS preflight
// to forward, and Next.js answers OPTIONS itself with the methods below.
export const GET = forward;
export const HEAD = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
