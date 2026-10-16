import { request } from "./client";

/*
 * Providers supply inference. `aggregator` resells many models (fal,
 * Replicate), `first_party` is the lab's own API (OpenAI, Google), and
 * `managed` is capacity we run ourselves (our GPUs, later). Each version
 * reaches providers through routes (see models.ts).
 */

export const PROVIDER_KINDS = ["aggregator", "first_party", "managed"] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

/** Paused providers get no new attempts; their routes fall through to the next one. */
export const PROVIDER_STATUSES = ["active", "paused", "disabled"] as const;
export type ProviderStatus = (typeof PROVIDER_STATUSES)[number];

/** How the gateway talks to the provider: one adapter per wire protocol. */
export const ADAPTERS = ["fal", "replicate", "openai", "vertex", "elevenlabs", "runway", "http"] as const;
export type Adapter = (typeof ADAPTERS)[number];

export type HealthState = "operational" | "degraded" | "outage";

export interface ProviderCredential {
  configured: boolean;
  /** Last characters of the secret, e.g. "…a1b2"; the secret itself never leaves the server. */
  hint: string | null;
  source: "console" | "environment" | null;
  rotatedAt: string | null;
}

export interface Provider {
  id: string;
  name: string;
  kind: ProviderKind;
  adapter: Adapter;
  status: ProviderStatus;
  baseUrl: string;
  regions: string[];
  credential: ProviderCredential;
  limits: {
    /** Requests in flight at once, across every route. */
    concurrency: number | null;
    requestsPerMinute: number | null;
  };
  health: {
    state: HealthState;
    successRate24h: number | null;
    p50Ms: number | null;
    incidents7d: number;
    checkedAt: string | null;
  };
  routes: number;
  models: number;
  requests24h: number;
  /** What we paid the provider in the last 30 days. */
  cost30d: number;
  /** Prepaid balance at the provider, when it reports one. */
  balance: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewProvider {
  id: string;
  name: string;
  kind: ProviderKind;
  adapter: Adapter;
  baseUrl: string;
  regions: string[];
}

export type ProviderUpdate = Partial<Pick<Provider, "name" | "baseUrl" | "regions" | "limits">>;

export const listProviders = () => request<Provider[]>("/providers");

/** 409 `fields.id` when the ID is taken. */
export const createProvider = (body: NewProvider) => request<Provider>("/providers", { method: "POST", body });

export const updateProvider = (id: string, body: ProviderUpdate) =>
  request<Provider>(`/providers/${id}`, { method: "PATCH", body });

/** Every route through the provider stops taking new attempts; requests fall through to other routes. */
export const pauseProvider = (id: string, reason: string) =>
  request<Provider>(`/providers/${id}/pause`, { method: "POST", body: { reason } });

export const resumeProvider = (id: string) => request<Provider>(`/providers/${id}/resume`, { method: "POST" });

/** Write-only: the secret is stored encrypted and only its hint comes back. */
export const setProviderCredential = (id: string, secret: string) =>
  request<Provider>(`/providers/${id}/credential`, { method: "PUT", body: { secret } });

/** Calls the provider's cheapest health endpoint with the stored credential. */
export const checkProvider = (id: string) =>
  request<{ ok: boolean; latencyMs: number; message: string; provider: Provider }>(`/providers/${id}/check`, {
    method: "POST",
  });
