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

export const login = (body: { email: string; password: string }) =>
  request<Operator>("/auth/login", { method: "POST", body, redirectOnUnauthorized: false });

export const logout = () => request("/auth/logout", { method: "POST", redirectOnUnauthorized: false });

export const getMe = () => request<Operator>("/me");

/** Ends the operator's other sessions. 422 `fields.currentPassword` when it is wrong. */
export const changePassword = (body: { currentPassword: string; newPassword: string }) =>
  request("/me/password", { method: "POST", body });
