import { request, type Page, type PageParams } from "./client";

export interface AuditEntry {
  id: string;
  operator: { id: string; name: string } | null;
  action: string;
  targetType: string;
  targetId: string | null;
  detail: Record<string, unknown>;
  ip: string | null;
  at: string;
}

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
  "version.promote",
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
  "provider.pause",
  "provider.resume",
  "provider.credential",
  "customer.update",
  "customer.suspend",
  "customer.resume",
  "customer.credits",
  "api_key.update",
  "api_key.revoke",
  "request.refund",
  "operator.create",
  "operator.update",
  "operator.reset_password",
] as const;

export interface AuditFilters {
  operatorId?: string;
  /** Also matches dotted children: "version" matches "version.promote". */
  action?: string;
  /** What was changed, e.g. "model" or "customer"; used with `targetId`. */
  targetType?: string;
  targetId?: string;
}

export const listAudit = (params: AuditFilters & PageParams) =>
  request<Page<AuditEntry>>("/audit", { query: { ...params } });
