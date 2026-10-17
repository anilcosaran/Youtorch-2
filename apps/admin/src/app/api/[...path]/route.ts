import type { NextRequest } from "next/server";
import { handleMock } from "@/mock-api";

/**
 * Forwards `/api/*` to the admin API (`/api/admin/v1/me` → `${ADMIN_API_URL}/admin/v1/me`).
 * ADMIN_API_URL is read on every request, not at build time, so one image serves
 * every deployment. Without it, development (or ADMIN_API_MOCK=1) answers from
 * the in-memory mock in `src/mock-api`, which implements the same contract.
 */

// Hop-by-hop headers (RFC 9110 §7.6.1) and headers fetch sets itself.
const DROPPED_REQUEST = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
  "expect",
]);
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

async function forward(request: NextRequest): Promise<Response> {
  const path = request.nextUrl.pathname.replace(/^\/api/, "");
  const base = apiBase();
  if (!base) {
    if (mockAllowed()) return handleMock(request, path);
    return Response.json(
      { error: { code: "unavailable", message: "ADMIN_API_URL isn't set, so the console has no admin API." } },
      { status: 502 },
    );
  }
  const target = `${base}${path}${request.nextUrl.search}`;

  const headers = new Headers();
  request.headers.forEach((value, name) => {
    if (!DROPPED_REQUEST.has(name)) headers.set(name, value);
  });
  // Next fills these from the socket when no proxy in front set them.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) headers.set("x-forwarded-host", host);
  if (!headers.has("x-forwarded-proto")) {
    headers.set("x-forwarded-proto", request.nextUrl.protocol.replace(/:$/, ""));
  }

  const body =
    request.method === "GET" || request.method === "HEAD" ? undefined : await readBody(request);
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
      headers,
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

export const GET = forward;
export const HEAD = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
export const OPTIONS = forward;
