import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-line-strong dot-grid px-6 py-12 text-center">
      <div className="mb-3 grid size-10 place-items-center rounded-xl border border-line-strong bg-raised text-muted [&_svg]:size-[18px]">
        {icon}
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-xs text-[14px] text-muted">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
