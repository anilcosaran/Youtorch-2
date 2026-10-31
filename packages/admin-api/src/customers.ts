import { request, type PageParams } from "./client";
import type { S } from "./schema";

/*
 * A customer is a workspace, the billing account. Credits are prepaid and every
 * task draws them down. There are no plans: each limit has a platform default
 * in settings, and an operator can give one workspace its own value.
 */

export type CustomerStatus = S["CustomerStatus"];
export const CUSTOMER_STATUSES = ["active", "suspended"] as const satisfies readonly CustomerStatus[];

export type LedgerKind = S["LedgerKind"];
export const LEDGER_KINDS = ["top_up", "grant", "usage", "refund", "adjustment", "expire", "fee"] as const satisfies readonly LedgerKind[];

export type CreditKind = NonNullable<S["AdjustCredits"]["kind"]>;
export const CREDIT_KINDS = ["purchased", "gift"] as const satisfies readonly CreditKind[];

export type Limits = S["Limits"];
export type LimitOverrides = S["LimitOverrides"];
export type LimitName = S["LimitName"];
export type CustomerRow = S["CustomerRow"];
export type Customer = S["Customer"];
export type CustomerUpdate = S["CustomerUpdate"];
export type AdjustCredits = S["AdjustCredits"];
export type LedgerEntry = S["LedgerEntry"];

export interface CustomerFilters {
  query?: string;
  status?: CustomerStatus;
}

export const LIMIT_NAMES = [
  "requestsPerMinute",
  "concurrency",
  "queueSize",
  "queueWaitSeconds",
  "dailySpendMicros",
  "monthlySpendMicros",
  "subAccounts",
  "topUpMinMicros",
  "topUpMaxMicros",
  "firstWeekDailyTopUpMicros",
] as const satisfies readonly LimitName[];

/** The limits in force for the platform defaults and a workspace's own values; a missing or null value follows the default. */
export function limitsFor(defaults: Limits, overrides: LimitOverrides): Limits {
  const limits = { ...defaults };
  for (const name of LIMIT_NAMES) {
    const value = overrides[name];
    if (value !== undefined && value !== null) limits[name] = value;
  }
  return limits;
}

/** Spend limits count null as no limit, so setting one where there was none takes something away. */
const lowers = (from: number | null, to: number | null) => to !== null && (from === null || to < from);

/** What a change of limits takes away; empty when it only gives more. A higher smallest top-up takes away too. */
export function loweredLimits(from: Limits, to: Limits): LimitName[] {
  return LIMIT_NAMES.filter((name) => (name === "topUpMinMicros" ? to[name] > from[name] : lowers(from[name], to[name])));
}

const path = encodeURIComponent;

export const listCustomers = (params: CustomerFilters & PageParams) => request<S["CustomerPage"]>("/customers", { query: { ...params } });

export const getCustomer = (id: string) => request<Customer>(`/customers/${path(id)}`);

export const updateCustomer = (id: string, body: CustomerUpdate) => request<Customer>(`/customers/${path(id)}`, { method: "PATCH", body });

export const suspendCustomer = (id: string, reason: string) => request<Customer>(`/customers/${path(id)}/suspend`, { method: "POST", body: { reason } });

export const resumeCustomer = (id: string) => request<Customer>(`/customers/${path(id)}/resume`, { method: "POST" });

export const adjustCredits = (id: string, body: AdjustCredits) => request<Customer>(`/customers/${path(id)}/credits`, { method: "POST", body });

export const listLedger = (id: string, params: PageParams) => request<S["LedgerPage"]>(`/customers/${path(id)}/ledger`, { query: { ...params } });
