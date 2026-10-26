import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { DEFAULT_OPERATOR_ID, MOCK_PASSWORD } from "./seed/operators";
import type { OperatorRecord, Store } from "./types";

/*
 * The mock's sessions. Signing in sets one cookie holding the operator's ID,
 * the session version they had then, a session ID and an expiry, signed with
 * an HMAC key made when the process starts. A cookie that was changed, made
 * up, or signed by an earlier process is refused, and so is one from before
 * the operator's password changed, their password was reset or they were
 * disabled (each bumps `sessionVersion`), or one that was signed out.
 *
 * In development (NODE_ENV isn't "production") a browser without a session
 * cookie is the seeded admin until it signs out, and MOCK_PASSWORD opens every
 * seeded account. A production build (ADMIN_API_MOCK=1) does neither: seeded
 * operators sign in with ADMIN_API_MOCK_PASSWORD.
 */

/** Whether the mock may take development shortcuts: automatic sign-in and MOCK_PASSWORD. */
export const isDevelopment = () => process.env.NODE_ENV !== "production";

/** Set on sign-out in development, so the browser isn't signed in as the seeded admin again. */
export const SIGNED_OUT_COOKIE = "mv_mock_signed_out";

/** Browsers keep `__Host-` cookies only from https, with Path=/ and no Domain; nothing else on the site can set them. */
export const SESSION_COOKIE = "__Host-mv_mock_session";
/** The name over plain http (development on localhost). */
export const SESSION_COOKIE_HTTP = "mv_mock_session";

/** Sessions end after 12 hours, signed out or not. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/** The shortest ADMIN_API_MOCK_PASSWORD the mock takes. */
const MIN_MOCK_PASSWORD = 12;

// On globalThis, so sessions survive hot reloads in development; a restart signs everyone out.
const holder = globalThis as typeof globalThis & { __modelvendMockSessionKey?: Buffer };
const signingKey = () => (holder.__modelvendMockSessionKey ??= randomBytes(32));

interface SessionClaims {
  /** Operator ID. */
  op: string;
  /** The operator's session version when the session began. */
  v: number;
  /** Session ID, so signing out ends this session only. */
  sid: string;
  /** Expiry, ms since the epoch. */
  exp: number;
}

const sign = (payload: string) => createHmac("sha256", signingKey()).update(payload).digest();

function encodeSession(claims: SessionClaims): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${sign(payload).toString("base64url")}`;
}

/** The claims of a cookie this process signed, or null for anything else. */
function decodeSession(value: string): SessionClaims | null {
  const dot = value.indexOf(".");
  if (dot <= 0 || dot !== value.lastIndexOf(".")) return null;
  const payload = value.slice(0, dot);
  const given = Buffer.from(value.slice(dot + 1), "base64url");
  const expected = sign(payload);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof claims !== "object" || claims === null) return null;
  const { op, v, sid, exp } = claims as Record<string, unknown>;
  if (typeof op !== "string" || typeof sid !== "string" || !Number.isInteger(v) || typeof exp !== "number") return null;
  return { op, v: v as number, sid, exp };
}

/**
 * Whether the browser reached the console over https: directly, or through a
 * proxy that ends TLS and says so in X-Forwarded-Proto. Believing the header
 * only ever makes a cookie stricter.
 */
export function isHttps(request: NextRequest): boolean {
  if (request.nextUrl.protocol === "https:") return true;
  return request.headers.get("x-forwarded-proto")?.split(",")[0].trim().toLowerCase() === "https";
}

const sessionCookieName = (request: NextRequest) => (isHttps(request) ? SESSION_COOKIE : SESSION_COOKIE_HTTP);

/** A `Set-Cookie` value: HttpOnly, SameSite=Lax, Path=/, and Secure over https. Without `value` it clears the cookie. */
export function cookie(request: NextRequest, name: string, value?: string, maxAgeSeconds?: number): string {
  const parts = [`${name}=${value ?? ""}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (isHttps(request)) parts.push("Secure");
  if (value === undefined) parts.push("Max-Age=0");
  else if (maxAgeSeconds !== undefined) parts.push(`Max-Age=${maxAgeSeconds}`);
  return parts.join("; ");
}

/** Starts a session for the operator at their current session version. */
export function sessionCookie(request: NextRequest, operator: OperatorRecord, now = Date.now()): string {
  const claims: SessionClaims = {
    op: operator.id,
    v: operator.sessionVersion,
    sid: randomBytes(16).toString("base64url"),
    exp: now + SESSION_TTL_MS,
  };
  return cookie(request, sessionCookieName(request), encodeSession(claims), SESSION_TTL_MS / 1000);
}

/** Clears the session cookie. */
export const clearSessionCookie = (request: NextRequest) => cookie(request, sessionCookieName(request));

/** The session the request carries, if it is valid and still live. */
function liveSession(store: Store, request: NextRequest, now: number): SessionClaims | null {
  const value = request.cookies.get(sessionCookieName(request))?.value;
  const claims = value ? decodeSession(value) : null;
  if (!claims || claims.exp <= now || store.endedSessions.has(claims.sid)) return null;
  return claims;
}

/** The signed-in operator, or null when signed out, the session has ended, or their account is disabled. */
export function currentOperator(store: Store, request: NextRequest, now = Date.now()): OperatorRecord | null {
  if (request.cookies.has(sessionCookieName(request))) {
    const claims = liveSession(store, request, now);
    const operator = claims ? store.operators.find((o) => o.id === claims.op) : undefined;
    if (!claims || !operator || operator.disabled || operator.sessionVersion !== claims.v) return null;
    return operator;
  }
  // Development only: no session cookie means the seeded admin, until the browser signs out.
  if (!isDevelopment() || request.cookies.get(SIGNED_OUT_COOKIE)?.value === "1") return null;
  const operator = store.operators.find((o) => o.id === DEFAULT_OPERATOR_ID);
  return operator && !operator.disabled ? operator : null;
}

/** Ends the request's session, so its cookie is refused even if a copy of it is sent again. */
export function endSession(store: Store, request: NextRequest, now = Date.now()): void {
  for (const [sid, exp] of store.endedSessions) if (exp <= now) store.endedSessions.delete(sid);
  const claims = liveSession(store, request, now);
  if (claims) store.endedSessions.set(claims.sid, claims.exp);
}

/** Ends every session the operator has; the caller issues a new cookie to keep the current one. */
export function endSessions(operator: OperatorRecord): void {
  operator.sessionVersion += 1;
}

/** Compares in constant time, whatever the lengths. */
function sameSecret(a: string, b: string): boolean {
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(a), digest(b));
}

/** Whether `password` is the operator's: their own, or MOCK_PASSWORD in development. */
export function passwordMatches(operator: OperatorRecord, password: string): boolean {
  const own = sameSecret(password, operator.password);
  const shared = sameSecret(password, MOCK_PASSWORD) && isDevelopment();
  return own || shared;
}

/**
 * What seeded operators sign in with: MOCK_PASSWORD in development; in a
 * production build, ADMIN_API_MOCK_PASSWORD, or else a random password nobody
 * knows, so the mock can't be signed in to until it is set.
 */
export function seedPassword(): string {
  if (isDevelopment()) return MOCK_PASSWORD;
  const configured = process.env.ADMIN_API_MOCK_PASSWORD ?? "";
  if (configured.length >= MIN_MOCK_PASSWORD && configured !== MOCK_PASSWORD) return configured;
  console.warn(
    `[mock-api] Set ADMIN_API_MOCK_PASSWORD (${MIN_MOCK_PASSWORD}+ characters, not the development password) to sign in to the mock.`,
  );
  return randomBytes(24).toString("base64url");
}

/* Sign-in throttling: a few failures per email, then 429 with Retry-After until the oldest one ages out. */

export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
/** Emails tracked at once; past this the stalest are dropped, so the map can't grow without bound. */
const MAX_TRACKED = 5_000;

function recentFailures(store: Store, email: string, now: number): number[] {
  const times = (store.loginFailures.get(email) ?? []).filter((at) => at > now - LOGIN_WINDOW_MS);
  if (times.length > 0) store.loginFailures.set(email, times);
  else store.loginFailures.delete(email);
  return times;
}

/** Seconds until the email may try again; 0 when it may now. */
export function loginRetryAfter(store: Store, email: string, now = Date.now()): number {
  const times = recentFailures(store, email, now);
  if (times.length < LOGIN_MAX_FAILURES) return 0;
  return Math.max(1, Math.ceil((times[times.length - LOGIN_MAX_FAILURES] + LOGIN_WINDOW_MS - now) / 1000));
}

export function recordLoginFailure(store: Store, email: string, now = Date.now()): void {
  const times = recentFailures(store, email, now);
  if (times.length === 0 && store.loginFailures.size >= MAX_TRACKED) {
    const stalest = store.loginFailures.keys().next().value;
    if (stalest !== undefined) store.loginFailures.delete(stalest);
  }
  store.loginFailures.delete(email);
  store.loginFailures.set(email, [...times, now]);
}

export const clearLoginFailures = (store: Store, email: string) => store.loginFailures.delete(email);
