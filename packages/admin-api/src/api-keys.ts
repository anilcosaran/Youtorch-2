import { request, type PageParams } from "./client";
import type { S } from "./schema";

/*
 * Customer API keys. The secret is shown once at creation in the customer
 * console; here only the prefix is known. Revoking is immediate and final.
 */

export type KeyStatus = S["KeyStatus"];
export const KEY_STATUSES = ["active", "revoked"] as const satisfies readonly KeyStatus[];

export type ApiKeyRow = S["ApiKey"];

export interface ApiKeyFilters {
  query?: string;
  status?: KeyStatus;
  customerId?: string;
}

export const listApiKeys = (params: ApiKeyFilters & PageParams) => request<S["ApiKeyPage"]>("/api-keys", { query: { ...params } });

export const revokeApiKey = (id: string, reason: string) =>
  request<ApiKeyRow>(`/api-keys/${encodeURIComponent(id)}/revoke`, { method: "POST", body: { reason } });

export const updateApiKey = (id: string, body: S["ApiKeyUpdate"]) => request<ApiKeyRow>(`/api-keys/${encodeURIComponent(id)}`, { method: "PATCH", body });
