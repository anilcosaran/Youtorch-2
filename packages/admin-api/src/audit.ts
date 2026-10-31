import { request, type PageParams } from "./client";
import type { S } from "./schema";

export type AuditEntry = S["AuditEntry"];

/** The dotted action names the server writes. */
export const AUDIT_ACTIONS = [
  "auth.login",
  "auth.login_failed",
  "auth.logout",
  "auth.password",
  "model.create",
  "model.update",
  "model.pause",
  "model.resume",
  "version.create",
  "version.update",
  "version.publish",
  "version.default",
  "version.deprecate",
  "version.retire",
  "route.create",
  "route.update",
  "route.delete",
  "app.create",
  "app.update",
  "app.release.create",
  "app.release.update",
  "app.release.publish",
  "app.rollback",
  "app.pause",
  "app.resume",
  "provider.create",
  "provider.update",
  "provider.enable",
  "provider.disable",
  "provider.pause",
  "provider.resume",
  "provider.credential",
  "customer.update",
  "customer.suspend",
  "customer.resume",
  "customer.credits",
  "api_key.update",
  "api_key.revoke",
  "task.refund",
  "operator.create",
  "operator.update",
  "operator.reset_password",
  "settings.update",
] as const;

export interface AuditFilters {
  operatorId?: string;
  /** Also matches dotted children: "version" matches "version.publish". */
  action?: string;
  /** What was changed, e.g. "model" or "customer"; used with `targetId`. */
  targetType?: string;
  targetId?: string;
  /**
   * Everything about one customer: changes to the customer itself, to its API keys (`api_key`) and refunds of its
   * tasks (`task`). Entries about keys and tasks carry the customer in `detail.customerId`.
   */
  customerId?: string;
}

export const listAudit = (params: AuditFilters & PageParams) =>
  request<S["AuditPage"]>("/audit", { query: { ...params } });
