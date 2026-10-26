import type { Model, Promo } from "@/types/model";

/** Rounds dollars to whole micro-dollars, the unit the API bills in. */
export function roundMicros(usd: number) {
  return Math.round(usd * 1e6) / 1e6;
}

/** Whether the offer still runs on `day` (an ISO date); `until` is its last day. */
export function promoActive(promo: Promo, day: string) {
  return day <= promo.until;
}

/** Fraction off list prices. Anything outside (0, 1) is ignored rather than making prices free or negative. */
export function promoRate(model: Model) {
  const discount = model.promo?.discount ?? 0;
  return discount > 0 && discount < 1 ? discount : 0;
}

/**
 * Net price of `units` at a list unit price (the default tier when omitted). Like the API, it multiplies
 * first and rounds the total to micro-dollars, so long jobs don't inherit a rounded unit price.
 */
export function costOf(model: Model, units: number, listPrice = model.price) {
  return Math.max(0, roundMicros(listPrice * units * (1 - promoRate(model))));
}

/** Net price of one unit at a list price (the default tier when omitted). */
export function discounted(model: Model, listPrice = model.price) {
  return costOf(model, 1, listPrice);
}

const untilFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Last day of the offer, e.g. "Nov 30", or null without a valid promo. */
export function promoEnds(model: Model) {
  return model.promo && promoRate(model) ? untilFmt.format(Date.parse(model.promo.until)) : null;
}

/** "25% off until Nov 30" (or just "25% off"), or null without a valid promo. */
export function promoLabel(model: Model, withDate = true) {
  const rate = promoRate(model);
  if (!rate) return null;
  const off = `${Math.round(rate * 100)}% off`;
  const ends = promoEnds(model);
  return withDate && ends ? `${off} until ${ends}` : off;
}
