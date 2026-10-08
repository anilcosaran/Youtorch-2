import type { ReactNode } from "react";
import { LogoMark } from "@/components/brand/logo";

/** Full-height message used by the 404 and error boundaries. */
export function StatusScreen({
  code,
  title,
  description,
  actions,
}: {
  code: string;
  title: string;
  description: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div className="grid min-h-[70vh] place-items-center px-6 py-16 text-center">
      <div className="max-w-md animate-fade-up">
        <LogoMark className="mx-auto size-10" />
        <p className="mt-6 font-mono text-[12px] tracking-[0.18em] text-subtle uppercase">{code}</p>
        <h1 className="mt-2 text-[28px] leading-tight font-semibold tracking-[-0.02em] text-fg">{title}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">{description}</p>
        <div className="mt-7 flex flex-wrap justify-center gap-2">{actions}</div>
      </div>
    </div>
  );
}
