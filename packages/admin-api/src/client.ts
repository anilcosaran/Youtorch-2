/**
 * Typed fetch for the admin API. The browser calls `/api/admin/v1/...` on the
 * console's own origin; Next.js forwards it to `/admin/v1/...` on the admin
 * server and passes its Set-Cookie headers back untouched, so the session
 * cookie works only as `__Host-…; Path=/; Secure; HttpOnly; SameSite=Lax`
 * (see the sessions note in `auth.ts`): a cookie scoped to `/admin/v1` would
 * never be sent back.
 *
 * Throttled endpoints (sign-in, at least) answer 429 with `Retry-After` in
 * seconds; `request` turns that into an ApiError with code `rate_limited`.
 *
 * Every request that changes state must be `Content-Type: application/json`,
 * or the server answers 415 `unsupported_media_type`: a form on another site
 * can't send that type without a CORS preflight, which nothing answers. The
 * console's proxy also refuses changes that don't come from its own pages (403
 * `cross_origin`), and sends the operator's address as a single
 * X-Forwarded-For entry, the only one the server should trust.
 */

const BASE = "/api/admin/v1";

/** A failed request: HTTP status plus the API's error code, message and field errors. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** A page of a list that can grow without bound. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Reporting window for series; one entry per UTC day, oldest first. */
export type Range = "7d" | "30d" | "90d";

export const RANGES: Range[] = ["7d", "30d", "90d"];

/** Paging parameters shared by every list endpoint. */
export interface PageParams {
  limit?: number;
  cursor?: string;
}

export type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
  /** Off for the sign-in form, which handles 401 itself. Otherwise a 401 sends the browser to /login. */
  redirectOnUnauthorized?: boolean;
}

const FALLBACK: Record<number, string> = {
  0: "Can't reach the server. Check your connection and try again.",
  401: "Your session has ended. Sign in again.",
  403: "You don't have permission for that.",
  404: "That no longer exists.",
  409: "That conflicts with a change made elsewhere. Reload and try again.",
  413: "That request is too large.",
  415: "The server only accepts JSON.",
  422: "Some fields need another look.",
  500: "Something went wrong on the server. Try again in a moment.",
  502: "The admin server can't be reached right now.",
  503: "That service isn't available right now.",
  504: "The server took too long to answer. Try again.",
};

function queryString(query: Query | undefined): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

function redirectToLogin() {
  if (typeof window === "undefined") return;
  const { pathname, search } = window.location;
  if (pathname === "/login") return;
  // A full load, so nothing from the ended session stays in memory.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/login?next=${encodeURIComponent(pathname + search)}`);
}

async function toError(response: Response): Promise<ApiError> {
  let body: { error?: { code?: string; message?: string; fields?: Record<string, string> } } = {};
  try {
    body = await response.json();
  } catch {
    // Not JSON (a proxy error page, for example).
  }
  const status = response.status;
  if (status === 429) {
    const seconds = Number(response.headers.get("Retry-After"));
    const wait =
      seconds > 0
        ? ` Try again in ${seconds < 90 ? `${seconds} second${seconds === 1 ? "" : "s"}` : `${Math.ceil(seconds / 60)} minutes`}.`
        : " Try again shortly.";
    return new ApiError(status, "rate_limited", `Too many attempts.${wait}`);
  }
  const fallback = FALLBACK[status] ?? FALLBACK[Math.floor(status / 100) * 100] ?? FALLBACK[500];
  return new ApiError(
    status,
    body.error?.code ?? "unknown",
    body.error?.message || fallback,
    body.error?.fields,
  );
}

export async function request<T = void>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query, signal, redirectOnUnauthorized = true } = options;
  const headers: Record<string, string> = { Accept: "application/json" };
  // The API requires a JSON content type on every request that changes state (see above).
  if (method !== "GET") headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}${queryString(query)}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(0, "network", FALLBACK[0]);
  }

  if (!response.ok) {
    if (response.status === 401 && redirectOnUnauthorized) redirectToLogin();
    throw await toError(response);
  }
  const text = response.status === 204 ? "" : await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** A message fit for a toast or an error state, whatever was thrown. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return FALLBACK[500];
}

/** Field errors keyed by field name (a 422, or a 409 such as a taken email); empty otherwise. */
export function fieldErrors(error: unknown): Record<string, string> {
  return error instanceof ApiError ? error.fields : {};
}

export const isUnauthorized = (error: unknown) =>
  error instanceof ApiError && error.status === 401;
