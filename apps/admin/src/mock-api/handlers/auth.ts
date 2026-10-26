import { MIN_PASSWORD } from "@/lib/passwords";
import { audit } from "../audit";
import { fail, invalid } from "../http";
import { actor, route, type Context, type RouteDef } from "../router";
import {
  SIGNED_OUT_COOKIE,
  clearLoginFailures,
  clearSessionCookie,
  cookie,
  endSession,
  endSessions,
  isDevelopment,
  loginRetryAfter,
  passwordMatches,
  recordLoginFailure,
  sessionCookie,
} from "../session";
import { operatorView } from "../views";

function tooManyAttempts(seconds: number): Response {
  return Response.json(
    { error: { code: "rate_limited", message: "Too many sign-in attempts. Try again later." } },
    { status: 429, headers: { "Retry-After": String(seconds) } },
  );
}

function login(ctx: Context): Response {
  const { store, request } = ctx;
  const email = typeof ctx.body.email === "string" ? ctx.body.email.trim().toLowerCase() : "";
  const password = typeof ctx.body.password === "string" ? ctx.body.password : "";
  // Even the right password waits out the lockout, so guessing learns nothing.
  const wait = loginRetryAfter(store, email);
  if (wait > 0) return tooManyAttempts(wait);
  const operator = store.operators.find((o) => o.email === email) ?? null;
  const matches = operator !== null && passwordMatches(operator, password);
  if (!operator || !matches || operator.disabled) {
    recordLoginFailure(store, email);
    const reason = !operator ? "unknown_email" : !matches ? "wrong_password" : "disabled";
    audit(ctx, "auth.login_failed", "operator", operator?.id ?? null, { email, reason }, null);
    fail(401, "unauthorized", "That email and password don't match an active operator.");
  }
  clearLoginFailures(store, email);
  operator.lastLoginAt = new Date().toISOString();
  audit(ctx, "auth.login", "operator", operator.id, {}, operator);
  const response = Response.json(operatorView(operator));
  if (isDevelopment()) response.headers.append("Set-Cookie", cookie(request, SIGNED_OUT_COOKIE));
  response.headers.append("Set-Cookie", sessionCookie(request, operator));
  return response;
}

/** 204 even without a session. */
function logout(ctx: Context): Response {
  if (ctx.operator) audit(ctx, "auth.logout", "operator", ctx.operator.id);
  endSession(ctx.store, ctx.request);
  const response = new Response(null, { status: 204 });
  if (isDevelopment()) response.headers.append("Set-Cookie", cookie(ctx.request, SIGNED_OUT_COOKIE, "1"));
  response.headers.append("Set-Cookie", clearSessionCookie(ctx.request));
  return response;
}

/** Ends the operator's other sessions; this one carries on with a new cookie. */
function changePassword(ctx: Context): Response {
  const operator = actor(ctx);
  const current = typeof ctx.body.currentPassword === "string" ? ctx.body.currentPassword : "";
  const next = typeof ctx.body.newPassword === "string" ? ctx.body.newPassword : "";
  if (!passwordMatches(operator, current)) invalid("currentPassword", "That isn't your current password.");
  if (next.length < MIN_PASSWORD) invalid("newPassword", `Use at least ${MIN_PASSWORD} characters.`);
  if (next === current) invalid("newPassword", "Choose a password you aren't using now.");
  operator.password = next;
  endSessions(operator);
  audit(ctx, "auth.password", "operator", operator.id);
  const response = new Response(null, { status: 204 });
  response.headers.append("Set-Cookie", sessionCookie(ctx.request, operator));
  return response;
}

export const authRoutes: RouteDef[] = [
  route("POST", "/auth/login", "public", login),
  route("POST", "/auth/logout", "public", logout),
  route("GET", "/me", "signed-in", (ctx) => operatorView(actor(ctx))),
  route("POST", "/me/password", "signed-in", changePassword),
];
