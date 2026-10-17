import { differenceInMinutes, format, parseISO } from "date-fns";

const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const integerFormatter = new Intl.NumberFormat("en-US");
const usdFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** 1,284 · 12,940 */
export const integer = (n: number) => integerFormatter.format(n);

/** 1,284 → 1.3K. Small numbers stay exact. */
export const compact = (n: number) => (Math.abs(n) < 1000 ? integer(n) : compactFormatter.format(n));

/** A count for a small badge: exact up to 99, then "99+". With `more`, there are at least `n`. */
export function badgeCount(n: number, more = false): string {
  if (n > 99) return "99+";
  return more ? `${integer(n)}+` : integer(n);
}

/** A share (0–1) as a percentage: 0.4237 → "42.4%". */
export function percent(share: number, digits = 1): string {
  return `${(share * 100).toFixed(digits)}%`;
}

/** Money in US dollars: 1234.5 → "$1,234.50". Unknown amounts read "—". */
export function usd(dollars: number | null | undefined): string {
  if (dollars === null || dollars === undefined || !Number.isFinite(dollars)) return "—";
  return usdFormatter.format(Math.round(dollars * 100) / 100);
}

/** Large amounts in US dollars, shortened: 12840 → "$12.8K". */
export function usdCompact(dollars: number | null | undefined): string {
  if (dollars === null || dollars === undefined || !Number.isFinite(dollars)) return "—";
  if (Math.abs(dollars) < 1000) return usd(dollars);
  return `${dollars < 0 ? "-" : ""}$${compactFormatter.format(Math.abs(dollars))}`;
}

const unitFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

/** A per-unit price, which often has fractions of a cent: 0.045 → "$0.045", 0.0035 → "$0.0035". */
export function unitPrice(dollars: number | null | undefined): string {
  if (dollars === null || dollars === undefined || !Number.isFinite(dollars)) return "—";
  return unitFormatter.format(dollars);
}

/** Milliseconds as "820 ms" or "1.4 s". */
export function milliseconds(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
}

/** Minutes as "45m", "3h 12m" or "2d 4h". */
export function span(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}

/** "16 Oct 2026, 14:03" in the viewer's time zone. */
export const dateTime = (value: string) => format(parseISO(value), "d MMM yyyy, HH:mm");

/** "16 Oct 2026" in the viewer's time zone. */
export const dateOnly = (value: string) => format(parseISO(value), "d MMM yyyy");

/** A `YYYY-MM-DD` day as "16 Oct". Days are calendar dates, so no time zone applies. */
export const day = (value: string) => format(parseISO(value), "d MMM");

/** A `YYYY-MM-DD` day as "Fri 16 Oct". */
export const dayLong = (value: string) => format(parseISO(value), "EEE d MMM");

/** An hour bucket as "14:00" in the viewer's time zone. */
export const hour = (value: string) => format(parseISO(value), "HH:mm");

/** The exact instant in UTC, for tooltips. */
export const utc = (value: string) => `${parseISO(value).toISOString().replace("T", " ").slice(0, 19)} UTC`;

/** "just now", "5m ago", "3h ago", "4d ago", then a date. */
export function ago(value: string, now: Date): string {
  const minutes = Math.max(0, differenceInMinutes(now, parseISO(value)));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return dateOnly(value);
}

/** "in 5m", "in 3h", "in 4d", then a date; an instant already past reads as `ago`. */
export function fromNow(value: string, now: Date): string {
  const ms = parseISO(value).getTime() - now.getTime();
  if (ms <= 0) return ago(value, now);
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "in under a minute";
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `in ${days}d`;
  return dateOnly(value);
}

/** Minutes between an instant and now. */
export const minutesSince = (value: string, now: Date) =>
  Math.max(0, differenceInMinutes(now, parseISO(value)));

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** "content_policy" → "Content policy". */
export function humanize(value: string): string {
  const text = value.replace(/[_.-]+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Singular or plural noun with its count: plural(3, "account") → "3 accounts". */
export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${integer(n)} ${n === 1 ? singular : pluralForm}`;
}
