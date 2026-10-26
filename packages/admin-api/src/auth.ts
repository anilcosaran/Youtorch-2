import { request } from "./client";

/** `admin` holds every permission; `custom` holds the ones listed. */
export type Role = "admin" | "custom";

export type Permission =
  | "catalog.view"
  | "catalog.edit"
  | "catalog.publish"
  | "providers.view"
  | "providers.edit"
  | "customers.view"
  | "customers.edit"
  | "customers.credits"
  | "keys.view"
  | "keys.revoke"
  | "requests.view"
  | "audit.view"
  | "operators.manage";

export interface Operator {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** Every permission for an admin. */
  permissions: Permission[];
  createdAt: string;
  lastLoginAt: string | null;
  disabled: boolean;
}

/*
 * Sessions. Signing in sets one cookie, and the server must issue it as
 *
 *   Set-Cookie: __Host-mv_admin_session=<value>; Path=/; Secure; HttpOnly; SameSite=Lax
 *
 * - `__Host-` name, `Path=/`, no `Domain`. The console's proxy takes
 *   `/api/admin/v1/*` to `/admin/v1/*` and passes Set-Cookie through as is,
 *   so a cookie with any other Path (`/admin/v1`, say) is never sent back by
 *   the browser. The prefix also makes the browser refuse the cookie from
 *   anywhere but this host over https, so the customer console and other
 *   subdomains can't plant or overwrite an operator's session.
 * - `Secure`, so it never travels over plain http; `HttpOnly`, so page scripts
 *   can't read it; `SameSite=Lax` (the proxy also refuses changes that don't
 *   come from the console's own pages). Browsers accept Secure cookies from
 *   http://localhost, so local development still works.
 * - The value is an unguessable random ID looked up server side, or a token
 *   signed with a server key and checked in constant time; either way it
 *   carries no permissions, which are read from the operator on every request.
 *   Sessions expire (idle and absolute limits), and signing out ends the
 *   session server side, so a copied cookie stops working too.
 * - Sessions end at once, not at expiry: all of an operator's when their
 *   password is reset or they are disabled (enabling them again doesn't bring
 *   the old ones back), and all but the current one when they change their own
 *   password; that one may get a fresh cookie in the response.
 */

/**
 * 401 `unauthorized` for an unknown email, a wrong password or a disabled
 * account alike, so the answer doesn't tell which. Sign-in is throttled per
 * account and per address: after a few failures the server answers 429
 * `rate_limited` with `Retry-After` (seconds) until the window passes, even to
 * the right password, and `client.ts` turns that into "Try again in …".
 */
export const login = (body: { email: string; password: string }) =>
  request<Operator>("/auth/login", { method: "POST", body, redirectOnUnauthorized: false });

/** Ends this session server side and clears the cookie; 204 even without a session. */
export const logout = () => request("/auth/logout", { method: "POST", redirectOnUnauthorized: false });

export const getMe = () => request<Operator>("/me");

/**
 * Ends the operator's other sessions; this one carries on. 422
 * `fields.currentPassword` when it is wrong, `fields.newPassword` when the new
 * one is shorter than 12 characters or the same as the current one.
 */
export const changePassword = (body: { currentPassword: string; newPassword: string }) =>
  request("/me/password", { method: "POST", body });
