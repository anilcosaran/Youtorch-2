import { InfoTip } from "@/components/shared/info-tip";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * A dashboard card: a thin accent bar on the left, a title with an
 * explanation on hover, one line of description, then the content.
 */
export function ChartCard({
  title,
  info,
  description,
  accent = "var(--series-1)",
  action,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  info?: React.ReactNode;
  description?: React.ReactNode;
  /** CSS colour of the accent bar. */
  accent?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn("relative flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card", className)}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: accent }} />
      <header className="flex items-start gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h2 className="truncate text-[15px] font-semibold">{title}</h2>
            {info && <InfoTip label={title}>{info}</InfoTip>}
          </div>
          {description && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </header>
      <div className={cn("min-w-0 flex-1 px-5 pb-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Placeholder with the height of the chart it stands for. */
export function ChartSkeleton({ height = 220 }: { height?: number }) {
  return (
    <div className="flex flex-col gap-3" style={{ height }} aria-busy="true" aria-label="Loading">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="flex-1" />
    </div>
  );
}

/** A chart with nothing in its range. */
export function ChartEmpty({ height = 220, message }: { height?: number; message: string }) {
  return (
    <div
      className="flex items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground"
      style={{ height }}
    >
      {message}
    </div>
  );
}
