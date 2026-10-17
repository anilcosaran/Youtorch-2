import { cn } from "@/lib/utils";

/** Pretty-printed JSON in a scrollable monospace block. */
export function JsonView({ value, className }: { value: unknown; className?: string }) {
  return (
    <pre
      className={cn(
        "scroll-thin max-h-96 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all",
        className,
      )}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
