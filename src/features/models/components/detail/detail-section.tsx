import type { ReactNode } from "react";
import { detailSections, type DetailSectionId } from "./sections";

export function DetailSection({ id, description, children }: { id: DetailSectionId; description: string; children: ReactNode }) {
  const { label, icon: Icon } = detailSections.find((s) => s.id === id)!;
  return (
    <section id={id} className="scroll-mt-20 lg:scroll-mt-8">
      <h2 className="flex items-center gap-2 text-[18px] font-semibold tracking-tight text-fg">
        <Icon className="size-[18px] text-muted" />
        {label}
      </h2>
      <p className="mt-1.5 mb-4 max-w-2xl text-[14.5px] leading-relaxed text-muted">{description}</p>
      {children}
    </section>
  );
}

/** Bordered frame around a section's main panel. */
export function DetailPanel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line p-4 sm:p-5">
      <div className="rounded-lg border border-line bg-surface">{children}</div>
    </div>
  );
}
