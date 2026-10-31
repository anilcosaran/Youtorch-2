import type { ApiKeyRow } from "@modelvend/admin-api/api-keys";
import type { App, AppRelease } from "@modelvend/admin-api/apps";
import type { AuditEntry } from "@modelvend/admin-api/audit";
import type { Operator } from "@modelvend/admin-api/auth";
import type { Customer, LedgerEntry, LimitOverrides } from "@modelvend/admin-api/customers";
import type { Model } from "@modelvend/admin-api/models";
import type { Provider } from "@modelvend/admin-api/providers";
import type { Settings } from "@modelvend/admin-api/settings";
import type { TaskDetail } from "@modelvend/admin-api/tasks";
import type { Random } from "./random";

/*
 * What the store keeps. Records hold what an admin server would store;
 * derived fields (counts, costs, the default flag) are computed on read in
 * `views.ts`, so they never go stale after a change.
 */

export interface OperatorRecord extends Operator {
  /** What they sign in with; MOCK_PASSWORD also works, in development only. */
  password: string;
  /**
   * Goes up when their password changes or is reset, or they are disabled.
   * Session cookies carry the version they were issued under, so the older
   * ones stop working at once.
   */
  sessionVersion: number;
}

/** `routes`, `models` and `tasks24h` come from the catalog. */
export type ProviderRecord = Omit<Provider, "routes" | "models" | "tasks24h">;

/**
 * `versions`, `providers` and `price` are derived; in `versionList`,
 * `isDefault`, tier costs and route provider names are recomputed on read.
 */
export type ModelRecord = Omit<Model, "versions" | "providers" | "price">;

/** `costMicros` is computed from the steps. */
export type ReleaseRecord = Omit<AppRelease, "costMicros">;

export type AppRecord = Omit<App, "liveRelease" | "draftRelease" | "models" | "priceMicros" | "releases"> & {
  pausedReason: string | null;
  releases: ReleaseRecord[];
};

/** `keys` counts active keys; `limits` and `overrides` come from the settings and `limitOverrides`. */
export type CustomerRecord = Omit<Customer, "keys" | "members" | "limits" | "overrides"> & {
  limitOverrides: LimitOverrides;
  /** Newest first. */
  ledger: LedgerEntry[];
  /** Every member's email, which a search matches. The owner's is first. */
  memberEmails: string[];
};

export type ApiKeyRecord = Omit<ApiKeyRow, "customer"> & { customerId: string };

export interface Store {
  /** Date.now() when the store was seeded; seeded times are relative to it. */
  createdAt: number;
  /** For IDs and passwords made at runtime. */
  random: Random;
  operators: OperatorRecord[];
  /** Newest first. */
  audit: AuditEntry[];
  providers: ProviderRecord[];
  models: ModelRecord[];
  apps: AppRecord[];
  /** Newest first. */
  customers: CustomerRecord[];
  /** Newest first. */
  apiKeys: ApiKeyRecord[];
  /** Newest first, with app steps among them. */
  tasks: TaskDetail[];
  settings: Settings;
  /** Failed sign-ins per email (times, oldest first), for throttling. */
  loginFailures: Map<string, number[]>;
  /** Sessions signed out before they expired: session ID to its expiry. */
  endedSessions: Map<string, number>;
}
