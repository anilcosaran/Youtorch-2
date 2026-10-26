import type { BillingUnit } from "./models";
import { request, type Page, type PageParams } from "./client";

/*
 * Every call to the public API is one request, sync or queued. A request
 * makes one or more attempts: the router tries routes in order and falls
 * back when one fails before producing output. Only the successful attempt
 * is billed, at `units × tier price × (1 − promo)`; failed and canceled
 * requests cost the customer nothing (`price` 0). `cost` is what the provider
 * charged us, which a failure can still have (a provider that generated the
 * output before its safety filter blocked it bills for it).
 */

export const REQUEST_STATUSES = ["queued", "running", "succeeded", "failed", "canceled"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export type AttemptStatus = "succeeded" | "failed" | "timeout" | "canceled";

export interface RequestRow {
  /** `req_…`; also the ID callers poll and receive in webhooks. */
  id: string;
  model: string;
  version: string;
  /** Set when an app run made the request. */
  app: string | null;
  customer: { id: string; name: string };
  keyPrefix: string;
  status: RequestStatus;
  /** Provider of the attempt that finished it. */
  provider: string | null;
  attempts: number;
  /** From accepted to finished. */
  latencyMs: number | null;
  units: number;
  unit: BillingUnit;
  price: number;
  cost: number;
  errorCode: string | null;
  createdAt: string;
}

export interface Attempt {
  number: number;
  provider: string;
  routeId: string;
  upstreamModel: string;
  /** The provider's own request ID, for their support. */
  upstreamId: string | null;
  status: AttemptStatus;
  latencyMs: number | null;
  error: string | null;
  startedAt: string;
}

export interface RequestDetail extends RequestRow {
  mode: "sync" | "queue";
  input: Record<string, unknown>;
  /** Output with media as storage URLs; null until it succeeds. */
  output: Record<string, unknown> | null;
  errorMessage: string | null;
  webhookUrl: string | null;
  /** When the price went back to the customer; a request is refunded at most once. */
  refundedAt: string | null;
  attemptList: Attempt[];
  events: { at: string; status: RequestStatus | "attempt"; detail: string }[];
}

export interface RequestFilters {
  query?: string;
  status?: RequestStatus;
  model?: string;
  provider?: string;
  customerId?: string;
}

export const listRequests = (params: RequestFilters & PageParams) =>
  request<Page<RequestRow>>("/requests", { query: { ...params } });

export const getRequest = (id: string) => request<RequestDetail>(`/requests/${encodeURIComponent(id)}`);

/**
 * Gives the customer back what the request cost; written to their ledger. Only succeeded requests were
 * charged, so only they can be refunded (422 otherwise), and only once (409).
 */
export const refundRequest = (id: string, reason: string) =>
  request<RequestDetail>(`/requests/${encodeURIComponent(id)}/refund`, { method: "POST", body: { reason } });
