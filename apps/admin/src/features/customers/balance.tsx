import { usd } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Below this many dollars a balance is worth a look: the next few requests may drain it. */
export const LOW_BALANCE = 5;

/** Text colour for a balance: critical once it's gone, a warning while it's low. */
export function balanceClass(balance: number): string | undefined {
  if (balance <= 0) return "font-medium text-status-critical";
  if (balance < LOW_BALANCE) return "font-medium text-status-serious";
  return undefined;
}

/** A balance in dollars, coloured once it runs low. */
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
