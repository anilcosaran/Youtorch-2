export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** An ISO timestamp for epoch milliseconds. */
export const iso = (ms: number) => new Date(ms).toISOString();

/** `YYYY-MM-DD` in UTC. */
export const utcDay = (ms: number) => iso(ms).slice(0, 10);

/** Midnight UTC of the day `ms` falls in. */
export const startOfUtcDay = (ms: number) => Math.floor(ms / DAY) * DAY;

/** Rounds to `digits` decimals. */
export function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Dollars to the micro-dollar, as the API stores them. */
export const money = (value: number) => round(value, 6);

/** "$1.20" for messages. */
export const dollars = (value: number) => `$${value.toFixed(2)}`;

export const clone = <T>(value: T): T => structuredClone(value);

/** Whether two JSON values are equal. */
export const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Sums `pick` over the items. */
export function sum<T>(items: readonly T[], pick: (item: T) => number): number {
  let total = 0;
  for (const item of items) total += pick(item);
  return total;
}

/** Each value once, in first-seen order. */
export const unique = <T>(items: readonly T[]): T[] => [...new Set(items)];
