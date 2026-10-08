import { cn } from "@/lib/cn";
import { chartAccent } from "./constants";

export function MiniBars({
  values,
  color = chartAccent,
  animate = false,
  className,
}: {
  values: number[];
  color?: string;
  /** Grow bars in from the baseline, staggered left to right. */
  animate?: boolean;
  className?: string;
}) {
  const max = Math.max(...values, 0);
  return (
    <div className={cn("flex h-11 items-end gap-1", className)}>
      {values.map((v, i) => (
        <span key={i} className="relative flex h-full flex-1 items-end">
          {v > 0 ? (
            <span
              className={cn("w-full origin-bottom rounded-t-[2px] transition-[height] duration-500", animate && "animate-rise")}
              style={{
                height: `${Math.max(4, (v / max) * 100)}%`,
                background: color,
                animationDelay: animate ? `${(i / values.length) * 450}ms` : undefined,
              }}
            />
          ) : (
            <span className="h-[2px] w-full bg-white/25" />
          )}
        </span>
      ))}
    </div>
  );
}
