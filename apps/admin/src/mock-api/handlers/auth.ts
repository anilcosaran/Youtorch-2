import { MIN_PASSWORD } from "@/lib/passwords";
import { audit } from "../audit";
import { fail, invalid } from "../http";
import { actor, route, type Context, type RouteDef } from "../router";
import { MOCK_PASSWORD } from "../seed/operators";
import { OPERATOR_COOKIE, SIGNED_OUT_COOKIE, cookie } from "../session";
import { operatorView } from "../views";

function login(ctx: Context): Response {
  const email = typeof ctx.body.email === "string" ? ctx.body.email.trim().toLowerCase() : "";
  const password = typeof ctx.body.password === "string" ? ctx.body.password : "";
  const operator = ctx.store.operators.find((o) => o.email === email) ?? null;
  const matches = operator !== null && (password === MOCK_PASSWORD || password === operator.password);
  if (!operator || !matches || operator.disabled) {
    const reason = !operator ? "unknown_email" : !matches ? "wrong_password" : "disabled";
    audit(ctx, "auth.login_failed", "operator", operator?.id ?? null, { email, reason }, null);
    fail(401, "unauthorized", "That email and password don't match an active operator.");
  }
  operator.lastLoginAt = new Date().toISOString();
  audit(ctx, "auth.login", "operator", operator.id, {}, operator);
  const response = Response.json(operatorView(operator));
  response.headers.append("Set-Cookie", cookie(SIGNED_OUT_COOKIE));
  response.headers.append("Set-Cookie", cookie(OPERATOR_COOKIE, operator.id));
  return response;
}

/** 204 even without a session. */
function logout(ctx: Context): Response {
  if (ctx.operator) audit(ctx, "auth.logout", "operator", ctx.operator.id);
  const response = new Response(null, { status: 204 });
  response.headers.append("Set-Cookie", cookie(SIGNED_OUT_COOKIE, "1"));
  response.headers.append("Set-Cookie", cookie(OPERATOR_COOKIE));
  return response;
}

function changePassword(ctx: Context): void {
  const operator = actor(ctx);
  const current = typeof ctx.body.currentPassword === "string" ? ctx.body.currentPassword : "";
  const next = typeof ctx.body.newPassword === "string" ? ctx.body.newPassword : "";
  if (current !== MOCK_PASSWORD && current !== operator.password) invalid("currentPassword", "That isn't your current password.");
  if (next.length < MIN_PASSWORD) invalid("newPassword", `Use at least ${MIN_PASSWORD} characters.`);
  if (next === current) invalid("newPassword", "Choose a password you aren't using now.");
  operator.password = next;
  audit(ctx, "auth.password", "operator", operator.id);
}

export const authRoutes: RouteDef[] = [
  route("POST", "/auth/login", "public", login),
  route("POST", "/auth/logout", "public", logout),
  route("GET", "/me", "signed-in", (ctx) => operatorView(actor(ctx))),
  route("POST", "/me/password", "signed-in", changePassword),
];
