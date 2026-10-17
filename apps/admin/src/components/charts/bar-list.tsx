import { integer } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface BarListItem {
  key: string;
  label: React.ReactNode;
  value: number;
  /** Extra figure shown before the value, e.g. a share or a second count. */
  detail?: React.ReactNode;
}

/** Ranked horizontal bars with their values, for "top N" breakdowns. */
export function BarList({
  items,
  color = "var(--series-1)",
  valueFormat = integer,
  className,
}: {
  items: BarListItem[];
  color?: string;
  valueFormat?: (n: number) => string;
  className?: string;
}) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <ul className={cn("flex flex-col gap-1", className)}>
      {items.map((item) => (
        <li key={item.key} className="relative flex h-8 items-center gap-3 overflow-hidden rounded-md px-2">
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 rounded-md opacity-15"
            style={{ width: `${(item.value / max) * 100}%`, background: color }}
          />
          <span className="relative flex min-w-0 flex-1 items-center gap-2 truncate text-sm">
            {item.label}
          </span>
          {item.detail && (
            <span className="relative shrink-0 text-xs text-muted-foreground tabular">{item.detail}</span>
          )}
          <span className="relative shrink-0 text-sm font-medium tabular">
            {valueFormat(item.value)}
          </span>
        </li>
      ))}
    </ul>
  );
}
