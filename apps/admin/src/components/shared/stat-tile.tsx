import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** One headline number with its label and a line of context. */
export function StatTile({
  label,
  value,
  hint,
  info,
  tone,
  className,
}: {
  label: string;
  /** Formatted value; undefined while loading. */
  value: React.ReactNode;
  hint?: React.ReactNode;
  info?: React.ReactNode;
  /** Marks a number that needs someone to act. */
  tone?: "attention";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 rounded-lg border bg-card px-5 py-4", className)}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {tone === "attention" && (
          <span className="size-1.5 shrink-0 rounded-full bg-status-serious" aria-hidden />
        )}
        {info ? (
          // The explanation sits on the label itself, so tiles stay free of icons.
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                tabIndex={0}
                className="cursor-help truncate underline decoration-muted-foreground/40 decoration-dotted underline-offset-4 outline-none focus-visible:text-foreground"
              >
                {label}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">{info}</TooltipContent>
          </Tooltip>
        ) : (
          <span className="truncate">{label}</span>
        )}
      </div>
      {value === undefined ? (
        <Skeleton className="mt-2.5 h-8 w-20" />
      ) : (
        <div className="mt-1.5 text-[28px] leading-none font-semibold tracking-tight tabular">{value}</div>
      )}
      {hint && <div className="mt-2 truncate text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
