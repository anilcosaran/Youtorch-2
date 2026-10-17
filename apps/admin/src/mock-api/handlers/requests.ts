import { audit } from "../audit";
import { conflict, invalidState, notFound, paginate } from "../http";
import { actor, route, type Context, type RouteDef } from "../router";
import type { Store } from "../types";
import { dollars, money } from "../util";
import { reason } from "../validate";
import { requestRow, requestView } from "../views";

function findRequest(store: Store, id: string) {
  return store.requests.find((r) => r.id === id) ?? notFound("request");
}

function listRequests({ store, query }: Context) {
  const q = (query.get("query") ?? "").trim().toLowerCase();
  const status = query.get("status");
  const model = query.get("model");
  const provider = query.get("provider");
  const customerId = query.get("customerId");
  const items = store.requests.filter(
    (r) =>
      (!q || r.id.startsWith(q) || r.model.includes(q)) &&
      (!status || r.status === status) &&
      (!model || r.model === model) &&
      (!provider || r.provider === provider || r.attemptList.some((a) => a.provider === provider)) &&
      (!customerId || r.customer.id === customerId),
  );
  const page = paginate(items, query);
  return { ...page, items: page.items.map(requestRow) };
}

/** Gives the price back once: a refund ledger entry, a timeline event and `refundedAt`. */
function refund(ctx: Context) {
  const request = findRequest(ctx.store, ctx.params.id);
  if (request.refundedAt) conflict("This request was already refunded.");
  if (request.status !== "succeeded" && request.status !== "failed") invalidState("Only finished requests can be refunded.");
  if (!(request.price > 0)) invalidState("Nothing was charged for this request.");
  const why = reason(ctx.body);
  const operator = actor(ctx);
  const at = new Date().toISOString();
  request.refundedAt = at;
  request.events.push({ at, status: request.status, detail: `Refunded ${dollars(request.price)} to the customer by ${operator.name}: ${why}` });
  const customer = ctx.store.customers.find((c) => c.id === request.customer.id);
  if (customer) {
    customer.balance = money(customer.balance + request.price);
    customer.ledger.unshift({
      id: ctx.store.random.id("led_", 12),
      kind: "refund",
      amount: request.price,
      note: `Refund for ${request.id}: ${why}`,
      operator: operator.name,
      at,
    });
  }
  audit(ctx, "request.refund", "request", request.id, { amount: request.price, reason: why, customerId: request.customer.id });
  return requestView(request);
}

export const requestRoutes: RouteDef[] = [
  route("GET", "/requests", "requests.view", listRequests),
  route("GET", "/requests/:id", "requests.view", (ctx) => requestView(findRequest(ctx.store, ctx.params.id))),
  route("POST", "/requests/:id/refund", "customers.credits", refund),
];
