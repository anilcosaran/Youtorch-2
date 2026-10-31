import { CREDIT_KINDS, LIMIT_NAMES, limitsFor, loweredLimits, type LimitName, type LimitOverrides } from "@modelvend/admin-api/customers";
import { matchesQuery } from "@/lib/search";
import { audit, changes } from "../audit";
import { fail, forbidden, conflict, invalid, notFound, paginate } from "../http";
import { actor, route, type Context, type RouteDef } from "../router";
import type { CustomerRecord, Store } from "../types";
import { clone, dollars, toMicros } from "../util";
import { bool, checkNumber, has, nested, oneOf, reason, text, within } from "../validate";
import { customerRow, customerView } from "../views";

const LIMIT_RULES: Record<LimitName, Parameters<typeof checkNumber>[2]> = {
  requestsPerMinute: { min: 1, max: 100_000, integer: true },
  concurrency: { min: 1, max: 10_000, integer: true },
  queueSize: { min: 0, max: 100_000, integer: true },
  queueWaitSeconds: { min: 1, max: 86_400, integer: true },
  dailySpendMicros: { min: 1, integer: true },
  monthlySpendMicros: { min: 1, integer: true },
  subAccounts: { min: 0, max: 1000, integer: true },
  topUpMinMicros: { min: 1, integer: true },
  topUpMaxMicros: { min: 1, integer: true },
  firstWeekDailyTopUpMicros: { min: 1, integer: true },
};

/** Above this only an admin may add or take credits (docs/product-rules.md, section 10). */
const LARGE_ADJUSTMENT_MICROS = toMicros(1000);

function findCustomer(store: Store, id: string): CustomerRecord {
  return store.customers.find((c) => c.id === id) ?? notFound("customer");
}

function listCustomers({ store, query }: Context) {
  const q = query.get("query") ?? "";
  const status = query.get("status");
  const items = store.customers.filter(
    (c) => matchesQuery(q, c.name, c.owner.name, c.id, ...c.memberEmails) && (!status || c.status === status),
  );
  const page = paginate(items, query);
  return { ...page, items: page.items.map((c) => customerRow(store, c)) };
}

function listLedger(ctx: Context) {
  return paginate(findCustomer(ctx.store, ctx.params.id).ledger, ctx.query);
}

/**
 * `limits` replaces the workspace's own values: a number sets one, null or leaving it out follows the platform
 * default. A change that lowers a limit in force needs a reason, which goes into the audit entry.
 */
function updateCustomer(ctx: Context) {
  const customer = findCustomer(ctx.store, ctx.params.id);
  const { body } = ctx;
  let overrides: LimitOverrides | null = null;
  if (has(body, "limits")) {
    const limits = nested(body, "limits");
    overrides = within("limits", () => {
      const out: LimitOverrides = {};
      for (const [key, value] of Object.entries(limits)) {
        if (!(LIMIT_NAMES as readonly string[]).includes(key)) invalid(key, "Unknown limit.");
        if (value === null || value === undefined) continue;
        out[key as LimitName] = checkNumber(value, key, LIMIT_RULES[key as LimitName]);
      }
      return out;
    });
  }
  const why = text(body, "reason", { max: 500 }) || null;
  const next = overrides ?? customer.limitOverrides;
  const defaults = ctx.store.settings.limits;
  // Lowering anything takes effect on the next task, so it needs a reason on record.
  const lowered = loweredLimits(limitsFor(defaults, customer.limitOverrides), limitsFor(defaults, next));
  if (lowered.length > 0 && !why) invalid("reason", "Give a reason: this lowers the workspace's limits.");
  const before = { limits: clone(customer.limitOverrides) };
  customer.limitOverrides = next;
  const changed = changes(before, { limits: customer.limitOverrides }, ["limits"]);
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
  const { body } = ctx;
  const amountMicros = checkNumber(body.amountMicros, "amountMicros", { min: -1_000_000_000_000, max: 1_000_000_000_000, integer: true });
  if (amountMicros === 0) invalid("amountMicros", "Enter an amount other than zero.");
  const kind = amountMicros > 0 ? oneOf(body, "kind", CREDIT_KINDS, true) : null;
  const why = reason(body);
  if (Math.abs(amountMicros) > LARGE_ADJUSTMENT_MICROS && actor(ctx).role !== "admin") {
    forbidden(`Only an admin can move more than ${dollars(LARGE_ADJUSTMENT_MICROS)} at once.`);
  }
  if (amountMicros < 0 && customer.balanceMicros + amountMicros < 0 && !bool(body, "confirmNegative")) {
    const message = `That would take the balance below zero; it is ${dollars(customer.balanceMicros)}.`;
    fail(422, "negative_balance", message, { amountMicros: message });
  }
  customer.balanceMicros += amountMicros;
  customer.ledger.unshift({
    id: ctx.store.random.id("led_", 12),
    kind: kind === "purchased" ? "top_up" : kind === "gift" ? "grant" : "adjustment",
    amountMicros,
    note: why,
    operator: actor(ctx).name,
    at: new Date().toISOString(),
  });
  audit(ctx, "customer.credits", "customer", customer.id, { amountMicros, kind, reason: why, balanceMicros: customer.balanceMicros });
  return customerView(ctx.store, customer);
}

export const customerRoutes: RouteDef[] = [
  route("GET", "/customers", "customers.view", listCustomers),
  route("GET", "/customers/:id", "customers.view", (ctx) => customerView(ctx.store, findCustomer(ctx.store, ctx.params.id))),
  route("PATCH", "/customers/:id", "customers.edit", updateCustomer),
  route("POST", "/customers/:id/suspend", "customers.edit", suspend),
  route("POST", "/customers/:id/resume", "customers.edit", resume),
  route("POST", "/customers/:id/credits", "customers.credits", adjustCredits),
  route("GET", "/customers/:id/ledger", "customers.view", listLedger),
];
