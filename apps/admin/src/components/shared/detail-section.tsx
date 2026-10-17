import { cn } from "@/lib/utils";

/** A titled card on a detail page; `action` sits at the right of the title. */
export function DetailSection({
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("rounded-lg border bg-card", className)}>
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <h2 className="flex-1 text-sm font-semibold">{title}</h2>
        {action}
      </div>
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}
