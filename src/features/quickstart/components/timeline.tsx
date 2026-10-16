import type { ReactNode } from "react";

export function Timeline({ children }: { children: ReactNode }) {
  return (
    <ol className="relative max-w-4xl space-y-10 before:absolute before:top-2 before:bottom-2 before:left-[13px] before:w-px before:bg-gradient-to-b before:from-ember-500/60 before:via-line-strong before:to-transparent">
      {children}
    </ol>
  );
}

export function TimelineStep({ index, title, body, children }: { index: number; title: string; body: ReactNode; children?: ReactNode }) {
  return (
    <li className="relative pl-12">
      <span className="absolute top-0 left-0 grid size-7 place-items-center rounded-full border border-line-strong bg-raised font-mono text-[13px] text-ember-300">
        {index}
      </span>
      <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 mb-3.5 text-[14.5px] text-muted">{body}</p>
      {children}
    </li>
  );
}
