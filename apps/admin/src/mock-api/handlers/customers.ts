import { TIERS, limitsFor, loweredLimits, type Limits } from "@modelvend/admin-api/customers";
import { matchesQuery } from "@/lib/search";
import { audit, changes } from "../audit";
import { conflict, invalid, notFound, paginate } from "../http";
import { actor, route, type Context, type RouteDef } from "../router";
import type { CustomerRecord, Store } from "../types";
import { clone, dollars, money } from "../util";
import { checkNumber, has, nested, oneOf, reason, text, within } from "../validate";
import { customerRow, customerView } from "../views";

const LIMIT_RULES: Record<keyof Limits, Parameters<typeof checkNumber>[2]> = {
  requestsPerMinute: { min: 1, max: 100_000, integer: true },
  concurrency: { min: 1, max: 10_000, integer: true },
  monthlySpendCap: { above: 0 },
};

function findCustomer(store: Store, id: string): CustomerRecord {
  return store.customers.find((c) => c.id === id) ?? notFound("customer");
}

function listCustomers({ store, query }: Context) {
  const q = query.get("query") ?? "";
  const tier = query.get("tier");
  const status = query.get("status");
  const items = store.customers.filter(
    (c) => matchesQuery(q, c.name, c.email, c.workspace, c.id) && (!tier || c.tier === tier) && (!status || c.status === status),
  );
  const page = paginate(items, query);
  return { ...page, items: page.items.map((c) => customerRow(store, c)) };
}

/**
 * `limits` replaces the overrides: a number sets one, null or leaving it out goes back to the tier's default.
 * A change that lowers the tier or a limit in force needs a reason, which goes into the audit entry.
 */
function updateCustomer(ctx: Context) {
  const customer = findCustomer(ctx.store, ctx.params.id);
  const { body } = ctx;
  const tier = oneOf(body, "tier", TIERS);
  let overrides: Partial<Limits> | null = null;
  if (has(body, "limits")) {
    const limits = nested(body, "limits");
    overrides = within("limits", () => {
      const out: Partial<Limits> = {};
      for (const [key, value] of Object.entries(limits)) {
        if (!(key in LIMIT_RULES)) invalid(key, "Unknown limit.");
        if (value === null || value === undefined) continue;
        out[key as keyof Limits] = checkNumber(value, key, LIMIT_RULES[key as keyof Limits]);
      }
      return out;
    });
  }
  const why = text(body, "reason", { max: 500 }) || null;
  const nextTier = tier ?? customer.tier;
  const nextOverrides = overrides ?? customer.limitOverrides;
  // Lowering anything takes effect on the next request, so it needs a reason on record.
  const lowered = loweredLimits(
    { tier: customer.tier, limits: limitsFor(customer.tier, customer.limitOverrides) },
    { tier: nextTier, limits: limitsFor(nextTier, nextOverrides) },
  );
  if (lowered.length > 0 && !why) invalid("reason", "Give a reason: this lowers the workspace's tier or limits.");
  const before = { tier: customer.tier, limits: clone(customer.limitOverrides) };
  customer.tier = nextTier;
  customer.limitOverrides = nextOverrides;
  const changed = changes(before, { tier: customer.tier, limits: customer.limitOverrides }, ["tier", "limits"]);
  if (Object.keys(changed).length > 0) {
    audit(ctx, "customer.update", "customer", customer.id, { ...changed, ...(lowered.length > 0 && { lowered }), ...(why && { reason: why }) });
  }
  return customerView(ctx.store, customer);
}

function suspend(ctx: Context) {
  const customer = findCustomer(ctx.store, ctx.params.id);
  const why = reason(ctx.body);
  if (customer.status === "suspended") conflict("The customer is already suspended.");
  customer.status = "suspended";
  customer.suspendedReason = why;
  audit(ctx, "customer.suspend", "customer", customer.id, { reason: why });
  return customerView(ctx.store, customer);
}

function resume(ctx: Context) {
  const customer = findCustomer(ctx.store, ctx.params.id);
  if (customer.status !== "suspended") conflict("The customer isn't suspended.");
  const was = customer.suspendedReason;
  customer.status = "active";
  customer.suspendedReason = null;
  audit(ctx, "customer.resume", "customer", customer.id, { suspendedReason: was });
  return customerView(ctx.store, customer);
}

function adjustCredits(ctx: Context) {
  const customer = findCustomer(ctx.store, ctx.params.id);
  const amount = money(checkNumber(ctx.body.amount, "amount", { min: -1_000_000, max: 1_000_000 }));
  if (amount === 0) invalid("amount", "Enter an amount other than zero.");
  const why = reason(ctx.body);
  if (customer.balance + amount < 0) {
    invalid("amount", `That would take the balance below zero; it is ${dollars(customer.balance)}.`);
  }
  customer.balance = money(customer.balance + amount);
  customer.ledger.unshift({
    id: ctx.store.random.id("led_", 12),
    kind: amount > 0 ? "grant" : "adjustment",
    amount,
    note: why,
    operator: actor(ctx).name,
    at: new Date().toISOString(),
  });
  audit(ctx, "customer.credits", "customer", customer.id, { amount, reason: why, balance: customer.balance });
  return customerView(ctx.store, customer);
}

export const customerRoutes: RouteDef[] = [
  route("GET", "/customers", "customers.view", listCustomers),
  route("GET", "/customers/:id", "customers.view", (ctx) => customerView(ctx.store, findCustomer(ctx.store, ctx.params.id))),
  route("PATCH", "/customers/:id", "customers.edit", updateCustomer),
  route("POST", "/customers/:id/suspend", "customers.edit", suspend),
  route("POST", "/customers/:id/resume", "customers.edit", resume),
  route("POST", "/customers/:id/credits", "customers.credits", adjustCredits),
];
