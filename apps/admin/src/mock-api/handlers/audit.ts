import { paginate } from "../http";
import { route, type RouteDef } from "../router";
import { clone } from "../util";

export const auditRoutes: RouteDef[] = [
  route("GET", "/audit", "audit.view", ({ store, query }) => {
    const operatorId = query.get("operatorId");
    const action = query.get("action");
    const targetType = query.get("targetType");
    const targetId = query.get("targetId");
    const entries = store.audit.filter(
      (entry) =>
        (!operatorId || entry.operator?.id === operatorId) &&
        (!action || entry.action === action || entry.action.startsWith(`${action}.`)) &&
        (!targetType || entry.targetType === targetType) &&
        (!targetId || entry.targetId === targetId),
    );
    const page = paginate(entries, query);
    return { ...page, items: clone(page.items) };
  }),
];
