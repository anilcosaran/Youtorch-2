import { matchesQuery } from "@/lib/search";
import { audit } from "../audit";
import { conflict, invalid, invalidState, notFound, paginate } from "../http";
import { route, type Context, type RouteDef } from "../router";
import type { ApiKeyRecord, Store } from "../types";
import { has, nullableNumber, reason } from "../validate";
import { apiKeyView } from "../views";

function findKey(store: Store, id: string): ApiKeyRecord {
  return store.apiKeys.find((k) => k.id === id) ?? notFound("API key");
}

function listKeys({ store, query }: Context) {
  const q = query.get("query") ?? "";
  const env = query.get("env");
  const status = query.get("status");
  const customerId = query.get("customerId");
  const items = store.apiKeys.filter((key) => {
    if ((env && key.env !== env) || (status && key.status !== status) || (customerId && key.customerId !== customerId)) return false;
    const customer = store.customers.find((c) => c.id === key.customerId);
    // The audit log links a key by its ID, so IDs match too.
    return matchesQuery(q, key.id, key.name, key.prefix, customer?.name, customer?.workspace, customer?.email);
  });
  const page = paginate(items, query);
  return { ...page, items: page.items.map((key) => apiKeyView(store, key)) };
}

function revoke(ctx: Context) {
  const key = findKey(ctx.store, ctx.params.id);
  if (key.status === "revoked") conflict("This key is already revoked.");
  const why = reason(ctx.body);
  key.status = "revoked";
  key.revokedAt = new Date().toISOString();
  key.revokedReason = why;
  audit(ctx, "api_key.revoke", "api_key", key.id, { prefix: key.prefix, customerId: key.customerId, reason: why });
  return apiKeyView(ctx.store, key);
}

function update(ctx: Context) {
  const key = findKey(ctx.store, ctx.params.id);
  if (!has(ctx.body, "spendLimit")) invalid("spendLimit", "Send a spend limit, or null for none.");
  const spendLimit = nullableNumber(ctx.body, "spendLimit", { above: 0 }) ?? null;
  if (key.status === "revoked") invalidState("Revoked keys can't change.");
  if (spendLimit !== key.spendLimit) {
    audit(ctx, "api_key.update", "api_key", key.id, {
      prefix: key.prefix,
      customerId: key.customerId,
      spendLimit: { from: key.spendLimit, to: spendLimit },
    });
    key.spendLimit = spendLimit;
  }
  return apiKeyView(ctx.store, key);
}

export const apiKeyRoutes: RouteDef[] = [
  route("GET", "/api-keys", "keys.view", listKeys),
  route("POST", "/api-keys/:id/revoke", "keys.revoke", revoke),
  route("PATCH", "/api-keys/:id", "keys.revoke", update),
];
