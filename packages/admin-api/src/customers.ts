import type { BillingUnit } from "./models";
import { request, type Page, type PageParams } from "./client";

/*
 * A customer is a workspace (the billing account) and its owner. Credits are
 * prepaid; every request draws them down. Tiers set default rate limits;
 * a workspace can carry its own overrides.
 */

export const CUSTOMER_STATUSES = ["active", "suspended"] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const TIERS = ["free", "standard", "scale", "enterprise"] as const;
export type Tier = (typeof TIERS)[number];

export interface Limits {
  requestsPerMinute: number;
  concurrency: number;
  /** Requests stop once the month's spend reaches it; null for no cap. */
  monthlySpendCap: number | null;
}

export interface CustomerRow {
  id: string;
  name: string;
  email: string;
  workspace: string;
  tier: Tier;
  status: CustomerStatus;
  balance: number;
  spend30d: number;
  requests30d: number;
  keys: number;
  createdAt: string;
  lastActiveAt: string | null;
}

export const LEDGER_KINDS = ["top_up", "grant", "usage", "refund", "adjustment"] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

export interface LedgerEntry {
  id: string;
  kind: LedgerKind;
  /** Positive adds credit, negative takes it. Usage is summed per day. */
  amount: number;
  note: string;
  operator: string | null;
  at: string;
}

export interface Customer extends CustomerRow {
  /** Tier defaults with the workspace's overrides applied. */
  limits: Limits;
  /** Which limits are overrides rather than tier defaults. */
  overrides: (keyof Limits)[];
  autoReload: { enabled: boolean; threshold: number; amount: number };
  suspendedReason: string | null;
  usage: { day: string; requests: number; spend: number; errors: number }[];
  topModels: { modelId: string; requests: number; spend: number; unit: BillingUnit }[];
  ledger: LedgerEntry[];
}

export interface CustomerFilters {
  query?: string;
  tier?: Tier;
  status?: CustomerStatus;
}

export const TIER_LIMITS: Record<Tier, Limits> = {
  free: { requestsPerMinute: 10, concurrency: 2, monthlySpendCap: 10 },
  standard: { requestsPerMinute: 120, concurrency: 10, monthlySpendCap: null },
  scale: { requestsPerMinute: 600, concurrency: 50, monthlySpendCap: null },
  enterprise: { requestsPerMinute: 3000, concurrency: 200, monthlySpendCap: null },
};

/** The limits in force for a tier and a workspace's overrides (a missing or null override follows the tier). */
export function limitsFor(tier: Tier, overrides: Partial<Record<keyof Limits, number | null>>): Limits {
  const limits = { ...TIER_LIMITS[tier] };
  for (const key of Object.keys(limits) as (keyof Limits)[]) {
    const value = overrides[key];
    if (value !== undefined && value !== null) limits[key] = value;
  }
  return limits;
}

/** What a change of tier or limits takes away; empty when it only raises or keeps them. */
export function loweredLimits(from: { tier: Tier; limits: Limits }, to: { tier: Tier; limits: Limits }): ("tier" | keyof Limits)[] {
  const lowered: ("tier" | keyof Limits)[] = [];
  if (TIERS.indexOf(to.tier) < TIERS.indexOf(from.tier)) lowered.push("tier");
  if (to.limits.requestsPerMinute < from.limits.requestsPerMinute) lowered.push("requestsPerMinute");
  if (to.limits.concurrency < from.limits.concurrency) lowered.push("concurrency");
  const cap = to.limits.monthlySpendCap;
  const was = from.limits.monthlySpendCap;
  // A cap where there was none counts: requests start being refused once it's reached.
  if (cap !== null && (was === null || cap < was)) lowered.push("monthlySpendCap");
  return lowered;
}

const path = encodeURIComponent;

export const listCustomers = (params: CustomerFilters & PageParams) =>
  request<Page<CustomerRow>>("/customers", { query: { ...params } });

export const getCustomer = (id: string) => request<Customer>(`/customers/${path(id)}`);

export interface CustomerUpdate {
  tier?: Tier;
  /** Replaces the overrides; a null limit goes back to the tier's default. */
  limits?: Partial<Record<keyof Limits, number | null>>;
  /** Why; required when the change lowers anything (see `loweredLimits`), and written to the audit log. */
  reason?: string;
}

/**
 * `limits` replaces the overrides; a null limit goes back to the tier's default. A change that lowers the
 * tier or a limit in force, including a spend cap where there was none (moving to `free` adds a $10 cap), takes
 * effect on the next request, so it needs a `reason`: 422 `fields.reason` without one.
 */
export const updateCustomer = (id: string, body: CustomerUpdate) =>
  request<Customer>(`/customers/${path(id)}`, { method: "PATCH", body });

/** Requests from every key of the workspace fail with 403 `account_suspended`. */
export const suspendCustomer = (id: string, reason: string) =>
  request<Customer>(`/customers/${path(id)}/suspend`, { method: "POST", body: { reason } });

export const resumeCustomer = (id: string) => request<Customer>(`/customers/${path(id)}/resume`, { method: "POST" });

/** Grants (positive) or takes back (negative) credits; written to the ledger with the reason. */
export const adjustCredits = (id: string, body: { amount: number; reason: string }) =>
  request<Customer>(`/customers/${path(id)}/credits`, { method: "POST", body });
