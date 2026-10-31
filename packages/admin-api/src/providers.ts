import { request } from "./client";
import type { S } from "./schema";

/*
 * Providers supply inference. `first_party` is the lab's own API (OpenAI,
 * Google), and `managed` is capacity we run ourselves (our GPUs, later). Each
 * version reaches providers through routes (see models.ts).
 */

export type ProviderKind = S["ProviderKind"];
export const PROVIDER_KINDS = ["first_party", "managed"] as const satisfies readonly ProviderKind[];

export type ProviderStatus = S["ProviderStatus"];
export const PROVIDER_STATUSES = ["active", "paused", "disabled"] as const satisfies readonly ProviderStatus[];

export type Adapter = S["Adapter"];
export const ADAPTERS = ["google", "openai", "elevenlabs", "kling", "fake"] as const satisfies readonly Adapter[];

export type HealthState = S["HealthState"];
export type Provider = S["Provider"];
export type NewProvider = S["NewProvider"];
export type ProviderUpdate = S["ProviderUpdate"];

export const listProviders = () => request<Provider[]>("/providers");

const path = (id: string) => `/providers/${encodeURIComponent(id)}`;

export const createProvider = (body: NewProvider) => request<Provider>("/providers", { method: "POST", body });

export const updateProvider = (id: string, body: ProviderUpdate) => request<Provider>(path(id), { method: "PATCH", body });

export const enableProvider = (id: string) => request<Provider>(`${path(id)}/enable`, { method: "POST" });

export const disableProvider = (id: string, reason: string) => request<Provider>(`${path(id)}/disable`, { method: "POST", body: { reason } });

export const pauseProvider = (id: string, reason: string) => request<Provider>(`${path(id)}/pause`, { method: "POST", body: { reason } });

export const resumeProvider = (id: string) => request<Provider>(`${path(id)}/resume`, { method: "POST" });

export const setProviderCredential = (id: string, secret: string) => request<Provider>(`${path(id)}/credential`, { method: "PUT", body: { secret } });

export const checkProvider = (id: string) => request<S["ProviderCheck"]>(`${path(id)}/check`, { method: "POST" });
