import type { ApiKeyFilters } from "./api-keys";
import type { AuditFilters } from "./audit";
import type { Range } from "./client";
import type { CustomerFilters } from "./customers";
import type { ModelFilters } from "./models";
import type { RequestFilters } from "./requests";

type Paged<T> = T & { cursor?: string };

/** Query keys. Each area's first element lets a mutation invalidate the whole area. */
export const keys = {
  me: ["me"] as const,
  overviewAll: ["overview"] as const,
  overview: (range: Range) => ["overview", range] as const,
  models: ["models"] as const,
  modelList: (filters: Paged<ModelFilters>) => ["models", "list", filters] as const,
  modelSearch: (query: string) => ["models", "search", query] as const,
  /** Every model, for pickers such as an app step's model. */
  modelOptions: ["models", "list", "options"] as const,
  model: (id: string) => ["models", "detail", id] as const,
  apps: ["apps"] as const,
  appList: ["apps", "list"] as const,
  app: (slug: string) => ["apps", "detail", slug] as const,
  providers: ["providers"] as const,
  customers: ["customers"] as const,
  customerList: (filters: Paged<CustomerFilters>) => ["customers", "list", filters] as const,
  customerSearch: (query: string) => ["customers", "search", query] as const,
  customer: (id: string) => ["customers", "detail", id] as const,
  apiKeys: ["api-keys"] as const,
  apiKeyList: (filters: Paged<ApiKeyFilters>) => ["api-keys", "list", filters] as const,
  requests: ["requests"] as const,
  requestList: (filters: Paged<RequestFilters>) => ["requests", "list", filters] as const,
  request: (id: string) => ["requests", "detail", id] as const,
  permissionCatalog: ["permissions"] as const,
  operators: ["operators"] as const,
  audit: ["audit"] as const,
  auditList: (filters: Paged<AuditFilters>) => ["audit", "list", filters] as const,
};
