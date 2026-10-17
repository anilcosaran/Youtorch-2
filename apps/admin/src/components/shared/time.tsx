"use client";

import { ago, dateOnly, dateTime, utc } from "@/lib/format";
import { useNow } from "@/lib/use-now";

/** "5m ago", with the exact UTC instant on hover. */
export function RelativeTime({ value, empty = "Never" }: { value: string | null; empty?: string }) {
  const now = useNow();
  if (!value) return <span className="text-muted-foreground">{empty}</span>;
  return (
    <time dateTime={value} title={utc(value)} className="whitespace-nowrap">
      {ago(value, now)}
    </time>
  );
}

/** "16 Oct 2026, 14:03" (or just the date) in the viewer's time zone, with UTC on hover. */
export function DateTime({
  value,
  empty = "—",
  time = true,
}: {
  value: string | null;
  empty?: string;
  time?: boolean;
}) {
  if (!value) return <span className="text-muted-foreground">{empty}</span>;
  return (
    <time dateTime={value} title={utc(value)} className="whitespace-nowrap">
      {time ? dateTime(value) : dateOnly(value)}
    </time>
  );
}
