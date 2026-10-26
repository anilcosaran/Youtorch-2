import type { AuditEntry } from "@modelvend/admin-api/audit";
import { paginate } from "../http";
import { route, type RouteDef } from "../router";
import type { Store } from "../types";
import { clone } from "../util";

/**
 * The customer an entry is about: the customer itself, the owner of a key, or the customer of a refunded request.
 * Entries name the customer in `detail.customerId` when they write it; keys and requests are looked up for older ones.
 */
function customerOf(store: Store, entry: AuditEntry): string | null {
  if (entry.targetType === "customer") return entry.targetId;
  if (typeof entry.detail.customerId === "string") return entry.detail.customerId;
  if (entry.targetType === "api_key") return store.apiKeys.find((key) => key.id === entry.targetId)?.customerId ?? null;
  if (entry.targetType === "request") return store.requests.find((request) => request.id === entry.targetId)?.customer.id ?? null;
  return null;
}

export const auditRoutes: RouteDef[] = [
  route("GET", "/audit", "audit.view", ({ store, query }) => {
    const operatorId = query.get("operatorId");
    const action = query.get("action");
    const targetType = query.get("targetType");
    const targetId = query.get("targetId");
    const customerId = query.get("customerId");
    const entries = store.audit.filter(
      (entry) =>
        (!operatorId || entry.operator?.id === operatorId) &&
        (!action || entry.action === action || entry.action.startsWith(`${action}.`)) &&
        (!targetType || entry.targetType === targetType) &&
        (!targetId || entry.targetId === targetId) &&
        (!customerId || customerOf(store, entry) === customerId),
    );
    const page = paginate(entries, query);
    return { ...page, items: clone(page.items) };
  }),
];
