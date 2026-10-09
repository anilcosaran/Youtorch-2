import type { ReactNode } from "react";
import { panelId, tabId, type ModelTabId } from "./tabs";

export function DetailSection({ id, description, children }: { id: ModelTabId; description: string; children: ReactNode }) {
  return (
    <section id={panelId(id)} role="tabpanel" aria-labelledby={tabId(id)} className="animate-[fade-in_160ms_ease-out]">
      <p className="mb-4 max-w-2xl text-[14.5px] leading-relaxed text-muted">{description}</p>
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
