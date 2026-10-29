"use client";

import { useState, type DragEvent } from "react";
import { Download, PenLine, SlidersHorizontal, Upload, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import type { App } from "@/mocks/apps";
import type { inputCopy } from "../lib/apps";
import { AppShowcase } from "./app-media";

export interface DropProps {
  onDragOver: (e: DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent) => void;
}

const stepIcons: LucideIcon[] = [Upload, SlidersHorizontal, Download];
const scriptStepIcons: LucideIcon[] = [PenLine, SlidersHorizontal, Download];

/** First screen of an app: the sample result, one big call to action and a three-step explainer. Files can be dropped anywhere on it. */
export function AppHero({
  app,
  copy,
  onBrowse,
  onSample,
  dropProps,
}: {
  app: App;
  copy: ReturnType<typeof inputCopy>;
  onBrowse: () => void;
  onSample: () => void;
  dropProps: (onDragging: (on: boolean) => void) => DropProps;
}) {
  const [dragging, setDragging] = useState(false);
  const droppable = app.input !== "text";
  const icons = droppable ? stepIcons : scriptStepIcons;
  const ActionIcon = icons[0];

  return (
    <>
      <section {...(droppable ? dropProps(setDragging) : {})} className="relative mx-auto flex max-w-4xl flex-col items-center text-center">
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-line bg-canvas shadow-[0_40px_120px_-60px_rgb(0_0_0/0.9)]">
          <AppShowcase app={app} />
        </div>

        <h1 className="mt-10 text-[clamp(32px,4.4vw,46px)] leading-[1.05] font-semibold tracking-[-0.035em] text-fg">{app.name}</h1>
        <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-muted">{app.description}</p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={onBrowse}
            className="flex h-12 items-center gap-2 rounded-xl bg-white px-6 text-[15px] font-semibold text-black transition hover:bg-white/90 active:translate-y-px"
          >
            <ActionIcon className="size-4" /> {copy.action}
          </button>
          <button
            type="button"
            onClick={onSample}
            className="h-12 rounded-xl border border-line-strong px-5 text-[15px] font-medium text-fg transition hover:bg-white/[0.06]"
          >
            Try a sample
          </button>
        </div>
        <p className="mt-3 text-[12.5px] text-subtle">
          {copy.hint}
          {droppable && " · or drop it here"} · <span className="text-fg tabular">{formatPrice(app.price)}</span> per run
        </p>

        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute -inset-4 rounded-3xl border-2 border-dashed border-white/40 bg-white/[0.03] transition-opacity",
            dragging ? "opacity-100" : "opacity-0",
          )}
        />
      </section>

      <section className="mx-auto mt-16 max-w-4xl">
        <h2 className="text-center eyebrow">How it works</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-3">
          {app.steps.map((step, i) => {
            const Icon = icons[i];
            return (
              <li key={step} className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface/40 p-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/[0.07] text-fg">
                  <Icon className="size-[18px]" />
                </span>
                <span className="text-left">
                  <span className="block font-mono text-[11.5px] text-subtle">Step {i + 1}</span>
                  <span className="block text-[14.5px] font-medium text-fg">{step}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}
