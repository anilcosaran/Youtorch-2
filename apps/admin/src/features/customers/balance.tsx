import { toMicros } from "@modelvend/admin-api/money";
import { usd } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Below this many micro-dollars ($5) a balance is worth a look: the next few tasks may drain it. */
export const LOW_BALANCE = toMicros(5);

/** Text colour for a balance: critical once it's gone, a warning while it's low. */
export function balanceClass(balance: number): string | undefined {
  if (balance <= 0) return "font-medium text-status-critical";
  if (balance < LOW_BALANCE) return "font-medium text-status-serious";
  return undefined;
}

/** A balance in micro-dollars, coloured once it runs low. */
export function Balance({ value, className }: { value: number; className?: string }) {
  const tone = balanceClass(value);
  return (
    <span
      className={cn("tabular", tone, className)}
      title={tone ? (value <= 0 ? "No credit left" : `Below ${usd(LOW_BALANCE)}`) : undefined}
    >
      {usd(value)}
    </span>
  );
}
