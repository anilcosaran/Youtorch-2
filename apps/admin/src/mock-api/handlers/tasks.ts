import { audit } from "../audit";
import { conflict, invalidState, notFound, paginate } from "../http";
import { actor, route, type Context, type RouteDef } from "../router";
import type { Store } from "../types";
import { dollars } from "../util";
import { reason } from "../validate";
import { taskRow, taskView } from "../views";

function findTask(store: Store, id: string) {
  return store.tasks.find((t) => t.id === id) ?? notFound("task");
}

function listTasks({ store, query }: Context) {
  const q = (query.get("query") ?? "").trim().toLowerCase();
  const status = query.get("status");
  const model = query.get("model");
  const provider = query.get("provider");
  const customerId = query.get("customerId");
  const items = store.tasks.filter(
    (t) =>
      t.parentId === null &&
      (!q || t.id.startsWith(q) || (t.model ?? "").includes(q)) &&
      (!status || t.status === status) &&
      (!model || t.model === model) &&
      (!provider || t.provider === provider || t.attemptList.some((a) => a.provider === provider)) &&
      (!customerId || t.customer.id === customerId),
  );
  const page = paginate(items, query);
  return { ...page, items: page.items.map(taskRow) };
}

/**
 * Gives the amount back once: a refund ledger entry, a timeline event and `refundedAt`. Only succeeded tasks
 * are charged, so only they can be refunded.
 */
function refund(ctx: Context) {
  const task = findTask(ctx.store, ctx.params.id);
  if (task.refundedAt) conflict("This task was already refunded.");
  if (task.status === "failed" || task.status === "canceled") {
    invalidState(`Nothing to refund: ${task.status} tasks aren't charged.`);
  }
  if (task.status !== "succeeded") invalidState("Only finished tasks can be refunded.");
  if (!(task.amountMicros > 0)) invalidState("Nothing was charged for this task.");
  const why = reason(ctx.body);
  const operator = actor(ctx);
  const at = new Date().toISOString();
  task.refundedAt = at;
  task.events.push({ at, status: task.status, detail: `Refunded ${dollars(task.amountMicros)} to the customer by ${operator.name}: ${why}` });
  const customer = ctx.store.customers.find((c) => c.id === task.customer.id);
  if (customer) {
    customer.balanceMicros += task.amountMicros;
    customer.ledger.unshift({
      id: ctx.store.random.id("led_", 12),
      kind: "refund",
      amountMicros: task.amountMicros,
      note: `Refund for ${task.id}: ${why}`,
      operator: operator.name,
      at,
    });
  }
  audit(ctx, "task.refund", "task", task.id, { amountMicros: task.amountMicros, reason: why, customerId: task.customer.id });
  return taskView(task);
}

export const taskRoutes: RouteDef[] = [
  route("GET", "/tasks", "tasks.view", listTasks),
  route("GET", "/tasks/:id", "tasks.view", (ctx) => taskView(findTask(ctx.store, ctx.params.id))),
  route("POST", "/tasks/:id/refund", "customers.credits", refund),
];
