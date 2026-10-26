/** Limits of one card top-up, in dollars. */
export const MIN_TOP_UP = 5;
export const MAX_TOP_UP = 10_000;

export type AmountCheck = { ok: true; value: number } | { ok: false; error: string };

/**
 * Reads a dollar amount typed into a field: a finite number with at most two decimals, between `min` and `max`.
 * Rejects what `Number()` would quietly accept, such as "1e9", "Infinity" or "199.999".
 */
export function parseAmount(input: string, { min, max }: { min: number; max: number }): AmountCheck {
  const text = input.trim();
  const range = `Enter an amount from $${min.toLocaleString("en-US")} to $${max.toLocaleString("en-US")}.`;
  if (!text) return { ok: false, error: range };
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    return { ok: false, error: /^\d*\.\d{3,}$/.test(text) ? "Use at most two decimals." : range };
  }
  const value = Number(text);
  if (!Number.isFinite(value) || value < min || value > max) return { ok: false, error: range };
  return { ok: true, value: Math.round(value * 100) / 100 };
}
