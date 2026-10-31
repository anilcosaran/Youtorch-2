import { LIMIT_NAMES } from "@modelvend/admin-api/customers";
import { audit, changes } from "../audit";
import { invalid } from "../http";
import { route, type Context, type RouteDef } from "../router";
import { clone } from "../util";
import { bool, checkNumber, has, isObject, nested, number, reason, within } from "../validate";
import type { Settings } from "@modelvend/admin-api/settings";

const SPEND_LIMITS = ["dailySpendMicros", "monthlySpendMicros"] as const;

function readLimits(body: Record<string, unknown>): Settings["limits"] {
  const limits = {} as Settings["limits"];
  for (const name of LIMIT_NAMES) {
    const value = body[name];
    if (value === null && (SPEND_LIMITS as readonly string[]).includes(name)) {
      (limits as Record<string, number | null>)[name] = null;
      continue;
    }
    (limits as Record<string, number | null>)[name] = checkNumber(value, name, { min: 0, integer: true });
  }
  return limits;
}

function readBonus(body: Record<string, unknown>): Settings["bonus"] {
  const enabled = bool(body, "enabled") ?? false;
  if (!Array.isArray(body.steps)) return invalid("steps", "Must be a list.");
  const steps = body.steps.map((step: unknown, index) =>
    within(`steps.${index}`, () => {
      if (!isObject(step)) return invalid("step", "Must be an object.");
      return {
        minTopUpMicros: checkNumber(step.minTopUpMicros, "minTopUpMicros", { min: 1, integer: true }),
        rate: checkNumber(step.rate, "rate", { min: 0, max: 1 }),
      };
    }),
  );
  return { enabled, steps };
}

/** Everything is read before anything changes, so a refused update leaves the settings as they were. */
function updateSettings(ctx: Context) {
  const { store, body } = ctx;
  const why = reason(body);
  const next: Partial<Settings> = {};
  if (has(body, "limits")) next.limits = within("limits", () => readLimits(nested(body, "limits")));
  if (has(body, "bonus")) next.bonus = within("bonus", () => readBonus(nested(body, "bonus")));
  const minMargin = number(body, "minMargin", { min: 0, max: 1 });
  if (minMargin !== undefined) next.minMargin = minMargin;
  const cardFeeRate = number(body, "cardFeeRate", { min: 0, max: 1 });
  if (cardFeeRate !== undefined) next.cardFeeRate = cardFeeRate;
  const welcomeCreditMicros = number(body, "welcomeCreditMicros", { min: 0, integer: true });
  if (welcomeCreditMicros !== undefined) next.welcomeCreditMicros = welcomeCreditMicros;
  for (const field of ["purchasedCreditDays", "giftCreditDays"] as const) {
    const days = number(body, field, { min: 1, integer: true });
    if (days !== undefined) next[field] = days;
  }
  const refundWindowDays = number(body, "refundWindowDays", { min: 0, integer: true });
  if (refundWindowDays !== undefined) next.refundWindowDays = refundWindowDays;
  const before = clone(store.settings);
  Object.assign(store.settings, next);
  const changed = changes(before, store.settings, Object.keys(store.settings));
  if (Object.keys(changed).length > 0) audit(ctx, "settings.update", "settings", null, { ...changed, reason: why });
  return clone(store.settings);
}

export const settingsRoutes: RouteDef[] = [
  route("GET", "/settings", "signed-in", ({ store }) => clone(store.settings)),
  route("PATCH", "/settings", "settings.manage", updateSettings),
];
