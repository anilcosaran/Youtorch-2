import type { AUDIT_ACTIONS } from "@modelvend/admin-api/audit";
import type { Context } from "./router";
import type { OperatorRecord } from "./types";
import { sameJson } from "./util";

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Writes an audit entry for a change, by the signed-in operator unless `operator` says otherwise. */
export function audit(
  ctx: Context,
  action: AuditAction,
  targetType: string,
  targetId: string | null,
  detail: Record<string, unknown> = {},
  operator: OperatorRecord | null = ctx.operator,
): void {
  ctx.store.audit.unshift({
    id: ctx.store.random.id("aud_", 12),
    operator: operator ? { id: operator.id, name: operator.name } : null,
    action,
    targetType,
    targetId,
    detail,
    ip: "127.0.0.1",
    at: new Date().toISOString(),
  });
}

/** `{ field: { from, to } }` for every field that changed; large values just say they changed. */
export function changes(before: object, after: object, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const from = before as Record<string, unknown>;
  const to = after as Record<string, unknown>;
  for (const field of fields) {
    if (sameJson(from[field], to[field])) continue;
    const small = JSON.stringify(to[field] ?? null).length <= 200 && JSON.stringify(from[field] ?? null).length <= 200;
    out[field] = small ? { from: from[field] ?? null, to: to[field] ?? null } : "changed";
  }
  return out;
}
