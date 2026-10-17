import { request, type Page, type PageParams } from "./client";

/*
 * Customer API keys. The secret is shown once at creation in the customer
 * console; here only the prefix is known. Revoking is immediate and final.
 */

export const KEY_ENVS = ["live", "test"] as const;
export type KeyEnv = (typeof KEY_ENVS)[number];

export const KEY_STATUSES = ["active", "revoked"] as const;
export type KeyStatus = (typeof KEY_STATUSES)[number];

export interface ApiKeyRow {
  id: string;
  name: string;
  /** e.g. "mv_live_3fa9"; enough to find a key a customer pastes in a ticket. */
  prefix: string;
  env: KeyEnv;
  status: KeyStatus;
  customer: { id: string; name: string; workspace: string };
  /** Model IDs or app slugs it may call; empty for everything. */
  scopes: string[];
  /** Stops the key once its spend this month reaches it. */
  spendLimit: number | null;
  spend30d: number;
  requests30d: number;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
}

export interface ApiKeyFilters {
  query?: string;
  env?: KeyEnv;
  status?: KeyStatus;
  customerId?: string;
}

export const listApiKeys = (params: ApiKeyFilters & PageParams) =>
  request<Page<ApiKeyRow>>("/api-keys", { query: { ...params } });

export const revokeApiKey = (id: string, reason: string) =>
  request<ApiKeyRow>(`/api-keys/${id}/revoke`, { method: "POST", body: { reason } });

export const updateApiKey = (id: string, body: { spendLimit: number | null }) =>
  request<ApiKeyRow>(`/api-keys/${id}`, { method: "PATCH", body });
