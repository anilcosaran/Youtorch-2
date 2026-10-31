import { request } from "./client";
import type { S } from "./schema";

export type Role = S["Role"];
export type Permission = S["Permission"];
export type Operator = S["Operator"];

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

export const login = (body: { email: string; password: string }) =>
  request<Operator>("/auth/login", { method: "POST", body, redirectOnUnauthorized: false });

export const logout = () => request("/auth/logout", { method: "POST", redirectOnUnauthorized: false });

export const getMe = () => request<Operator>("/me");

export const changePassword = (body: { currentPassword: string; newPassword: string }) =>
  request("/me/password", { method: "POST", body });
