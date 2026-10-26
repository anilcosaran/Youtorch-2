import type { Operator, Permission, Role } from "./auth";
import { request } from "./client";

export interface PermissionInfo {
  id: Permission;
  area: string;
  label: string;
  description: string;
  /** Granted with it: customers.edit requires customers.view. */
  requires: Permission[];
}

export interface AccessPreset {
  id: string;
  label: string;
  description: string;
  role: Role;
  permissions: Permission[];
}

export interface PermissionCatalog {
  /** Grouped by area, in display order. */
  permissions: PermissionInfo[];
  presets: AccessPreset[];
}

export interface NewOperator {
  email: string;
  name: string;
  /** At least 12 characters; without it the server generates one. */
  password?: string;
  role: Role;
  /** Required for `custom` (at least one), ignored for `admin`; what they require is added. */
  permissions?: Permission[];
}

export interface OperatorUpdate {
  name?: string;
  role?: Role;
  permissions?: Permission[];
  disabled?: boolean;
}

export const getPermissionCatalog = () => request<PermissionCatalog>("/permissions");

export const listOperators = () => request<Operator[]>("/operators");

/*
 * operators.manage doesn't make an operator an admin. The server refuses with
 * 403 `forbidden` when the signed-in operator:
 * - gives access they don't hold themselves (only admins make admins);
 * - changes, disables or resets the password of an operator who has access
 *   they don't (an admin, for anyone but another admin).
 */

/**
 * A generated password comes back once and never again; a chosen one comes
 * back as null. 409 `fields.email` when the email is taken.
 */
export const createOperator = (body: NewOperator) =>
  request<{ operator: Operator; password: string | null }>("/operators", { method: "POST", body });

/**
 * Operators cannot change their own role or permissions, or disable themselves
 * (422 `fields.role`, `fields.permissions` or `fields.disabled`). 422
 * `invalid_state` when the change would leave no active admin.
 */
export const updateOperator = (id: string, body: OperatorUpdate) =>
  request<Operator>(`/operators/${id}`, { method: "PATCH", body });

/**
 * Ends the operator's sessions. Without `password` one is generated and returned.
 * 422 `own_password` for your own account: that goes through `changePassword`,
 * which asks for the current one.
 */
export const resetOperatorPassword = (id: string, password?: string) =>
  request<{ password: string | null }>(`/operators/${id}/reset-password`, {
    method: "POST",
    body: password ? { password } : {},
  });
