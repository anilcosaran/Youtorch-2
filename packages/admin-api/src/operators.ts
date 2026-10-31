import { request } from "./client";
import type { Operator } from "./auth";
import type { S } from "./schema";

export type PermissionInfo = S["PermissionInfo"];
export type AccessPreset = S["AccessPreset"];
export type PermissionCatalog = S["PermissionCatalog"];
export type NewOperator = S["NewOperator"];
export type OperatorUpdate = S["OperatorUpdate"];

export const getPermissionCatalog = () => request<PermissionCatalog>("/permissions");

export const listOperators = () => request<Operator[]>("/operators");

export const createOperator = (body: NewOperator) => request<S["CreatedOperator"]>("/operators", { method: "POST", body });

export const updateOperator = (id: string, body: OperatorUpdate) => request<Operator>(`/operators/${encodeURIComponent(id)}`, { method: "PATCH", body });

export const resetOperatorPassword = (id: string, password?: string) =>
  request<S["ResetPasswordResult"]>(`/operators/${encodeURIComponent(id)}/reset-password`, {
    method: "POST",
    body: password ? { password } : {},
  });
