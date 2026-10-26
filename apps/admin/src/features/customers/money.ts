/** 1250 or 1250.5 or 1250.50 ("1250." while still typing). */
const PLAIN = /^\d+(\.\d{0,2})?$/;
/** 1,250 or 1,250.50: commas only between groups of three digits. */
const GROUPED = /^\d{1,3}(,\d{3})+(\.\d{0,2})?$/;
/** 12,50 or 1,5 or 1.250,50: a comma before the last one or two digits is a decimal comma. */
const DECIMAL_COMMA = /,\d{1,2}$/;

/** Words for the operator when a typed amount uses a comma for cents. */
export const DECIMAL_COMMA_MESSAGE = "Use a dot for cents, as in 12.50. Commas only separate thousands, as in 1,250.00.";

const strip = (text: string) => text.trim().replace(/^\$\s*/, "");

/**
 * A typed dollar amount: null when the box is empty, NaN when it isn't an amount with at most two decimals.
 * A leading "$" is fine, and so are commas between thousands ("1,234.56"). A comma used for cents ("12,50", as
 * Turkish and much of Europe write it) is refused rather than guessed at, since reading it as a thousands
 * separator would make it a hundred times larger.
 */
export function parseDollars(text: string): number | null {
  const clean = strip(text);
  if (clean === "") return null;
  if (PLAIN.test(clean)) return Number(clean);
  if (GROUPED.test(clean)) return Number(clean.replace(/,/g, ""));
  return Number.NaN;
}

/** Why typed text isn't a dollar amount; null when it is one, or the box is empty. */
export function dollarsError(text: string): string | null {
  const value = parseDollars(text);
  if (value === null || !Number.isNaN(value)) return null;
  if (DECIMAL_COMMA.test(strip(text))) return DECIMAL_COMMA_MESSAGE;
  return "Enter an amount in dollars with at most two decimals, as in 1,250.00.";
}

/**
 * A typed whole number such as a rate limit: null when the box is empty, NaN unless it is digits, with commas
 * only between thousands ("1,000"). "1,5" is NaN, not 15.
 */
export function parseCount(text: string): number | null {
  const clean = text.trim();
  if (clean === "") return null;
  if (/^\d+$/.test(clean) || /^\d{1,3}(,\d{3})+$/.test(clean)) return Number(clean.replace(/,/g, ""));
  return Number.NaN;
}
