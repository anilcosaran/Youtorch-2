import type { Permission } from "@modelvend/admin-api/auth";
import { RANGES, type Range } from "@modelvend/admin-api/client";
import type { Overview, OverviewDay } from "@modelvend/admin-api/overview";
import { can } from "@/lib/permissions";
import { badRequest } from "../http";
import { createRandom, hashSeed } from "../random";
import { actor, route, type Context, type RouteDef } from "../router";
import type { Store } from "../types";
import { DAY, round, startOfUtcDay, sum, utcDay } from "../util";
import { providerView } from "../views";

const DAYS: Record<Range, number> = { "7d": 7, "30d": 30, "90d": 90 };

/** A day with every figure; the operator gets the ones they may see. */
type Day = Required<OverviewDay>;

/** Traffic grows about 0.8% a day, so 90 days ago was roughly half of today. */
const GROWTH = 0.992;

/**
 * One entry per UTC day, oldest first; today is the part of the day so far.
 * Each day is seeded by its date, so a day reads the same in every range and
 * on every reload. Yesterday matches the catalog's 24-hour task count.
 */
function series(store: Store, days: number, now: number): Day[] {
  const base = sum(store.models, (m) => m.tasks24h);
  const revenuePerTask = base > 0 ? sum(store.models, (m) => m.revenue30dMicros) / 30 / base : 0;
  const today = startOfUtcDay(now);
  return Array.from({ length: days }, (_, index) => {
    const age = days - 1 - index;
    const start = today - age * DAY;
    const random = createRandom(hashSeed(`overview:${utcDay(start)}`));
    const weekday = new Date(start).getUTCDay();
    const weekend = weekday === 0 || weekday === 6 ? 0.82 : 1;
    const elapsed = age === 0 ? Math.max(0.02, (now - today) / DAY) : 1;
    const growth = Math.pow(GROWTH, Math.max(0, age - 1));
    const tasks = Math.round(base * growth * weekend * random.float(0.93, 1.07) * elapsed);
    // The OpenAI incident two days ago shows as a bump in failures.
    const failRate = random.float(0.009, 0.016) + (age === 2 ? 0.011 : 0);
    const revenueMicros = Math.round(tasks * revenuePerTask * random.float(0.95, 1.05));
    return {
      day: utcDay(start),
      tasks,
      failed: Math.round(tasks * failRate),
      revenueMicros,
      costMicros: Math.round(revenueMicros * random.float(0.66, 0.72)),
      signups: Math.round((22 + random.int(0, 18)) * Math.sqrt(growth) * weekend * elapsed),
    };
  });
}

/**
 * The figures the operator may see, each behind the permission that guards the
 * same data on its own screen (see `overview.ts` in packages/admin-api).
 */
function visibility(may: (permission: Permission) => boolean) {
  const revenue = may("catalog.view") || may("customers.view");
  const cost = may("providers.view");
  return {
    traffic: may("tasks.view"),
    revenue,
    cost,
    // Margin and cost together give revenue.
    margin: revenue && cost,
    customers: may("customers.view"),
    catalog: may("catalog.view"),
    providers: may("providers.view"),
  };
}

function overview(ctx: Context): Overview {
  const { store, query } = ctx;
  const me = actor(ctx);
  const range = (query.get("range") ?? "30d") as Range;
  if (!RANGES.includes(range)) badRequest("`range` must be 7d, 30d or 90d.");
  const show = visibility((permission) => can(me, permission));
  const now = Date.now();
  const days = series(store, DAYS[range], now);
  const tasks24h = sum(store.models, (m) => m.tasks24h);
  const errors24h = sum(store.models, (m) => m.tasks24h * (m.errorRate24h ?? 0));
  const revenueMicros = sum(days, (d) => d.revenueMicros);
  const costMicros = sum(days, (d) => d.costMicros);
  // Full-day equivalents in the range, to scale each model's daily numbers.
  const scale = tasks24h > 0 ? sum(days, (d) => d.tasks) / tasks24h : 0;
  const providers = show.providers ? store.providers.map((p) => providerView(store, p)) : [];
  return {
    totals: {
      ...(show.traffic && {
        tasks24h,
        errorRate24h: tasks24h > 0 ? round(errors24h / tasks24h, 4) : null,
      }),
      ...(show.revenue && { revenueMicros }),
      ...(show.cost && { costMicros }),
      ...(show.margin && { margin: revenueMicros > 0 ? round((revenueMicros - costMicros) / revenueMicros, 4) : null }),
      ...(show.customers && {
        activeCustomers7d: store.customers.filter((c) => c.lastActiveAt !== null && Date.parse(c.lastActiveAt) > now - 7 * DAY).length,
      }),
      ...(show.catalog && {
        liveModels: store.models.filter((m) => m.state === "active" && m.versionList.some((v) => v.status === "live")).length,
        pausedModels: store.models.filter((m) => m.state === "paused").length,
        deprecatedVersions: sum(store.models, (m) => m.versionList.filter((v) => v.status === "deprecated").length),
      }),
      ...(show.providers && {
        providersDegraded: providers.filter((p) => p.status !== "disabled" && p.health.state !== "operational").length,
      }),
    },
    series: days.map((d) => ({
      day: d.day,
      ...(show.traffic && { tasks: d.tasks, failed: d.failed }),
      ...(show.revenue && { revenueMicros: d.revenueMicros }),
      ...(show.cost && { costMicros: d.costMicros }),
      ...(show.customers && { signups: d.signups }),
    })),
    ...(show.catalog && {
      topModels: store.models
        .map((m) => ({ modelId: m.id, name: m.name, tasks: Math.round(m.tasks24h * scale), revenueMicros: Math.round((m.revenue30dMicros / 30) * scale) }))
        .sort((a, b) => b.tasks - a.tasks)
        .slice(0, 8),
    }),
    ...(show.providers && {
      providers: providers.map((p) => ({
        id: p.id,
        name: p.name,
        state: p.health.state,
        successRate: p.health.successRate24h,
        p50Ms: p.health.p50Ms,
        tasks24h: p.tasks24h,
      })),
    }),
  };
}

/** Open to every signed-in operator; each figure checks its own permission. */
export const overviewRoutes: RouteDef[] = [route("GET", "/overview", "signed-in", overview)];
