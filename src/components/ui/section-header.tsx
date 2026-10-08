import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";

export function SectionHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3.5 flex items-end justify-between gap-4", className)}>
      <div>
        <h2 className="text-[19px] font-bold tracking-tight">{title}</h2>
        {description && <p className="mt-0.5 text-[14px] text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Quiet "View all →" style link used as a section header action. */
export function SectionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-1 text-[14px] text-muted transition hover:text-fg">
      {children} <ArrowRight className="size-3.5" />
    </Link>
  );
}
