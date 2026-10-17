import { cn } from "@/lib/utils";

/** The bordered box a paged list scrolls in. */
export function ListPanel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex min-h-80 flex-1 flex-col overflow-hidden rounded-lg border bg-card",
        className,
      )}
    >
      {children}
    </div>
  );
}
