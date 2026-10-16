"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Download, RotateCcw, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import type { Model } from "@/types/model";
import type { PlaygroundExample } from "../../lib/examples";
import type { PlaygroundRun } from "../../lib/playground";
import { gridFor, PlaygroundOutput, RenderProgress } from "./playground-output";
import { PlaygroundShowcase } from "./playground-showcase";

export type StageView = "output" | "example";

export function PlaygroundStage({
  model,
  view,
  onView,
  run,
  example,
  exampleIndex,
  exampleCount,
  onExampleIndex,
  onUseExample,
  onReuse,
}: {
  model: Model;
  view: StageView;
  onView: (view: StageView) => void;
  run?: PlaygroundRun;
  /** `labels` are the settings the example applies, shown under its prompt. */
  example?: PlaygroundExample & { labels: string[] };
  exampleIndex: number;
  exampleCount: number;
  onExampleIndex: (index: number) => void;
  onUseExample: (example: PlaygroundExample) => void;
  onReuse: (run: PlaygroundRun) => void;
}) {
  const toast = useToast();
  const showOutput = view === "output" && run;
  const step = (by: number) => onExampleIndex((exampleIndex + by + exampleCount) % exampleCount);

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface/40">
      <div className="flex h-12 items-center gap-1 border-b border-line px-2">
        <ViewTab active={view === "output"} disabled={!run} onClick={() => onView("output")}>
          Output
          {run?.status === "rendering" && <span className="size-1.5 animate-pulse rounded-full bg-fg" />}
        </ViewTab>
        {example && (
          <ViewTab active={view === "example"} onClick={() => onView("example")}>
            Example
          </ViewTab>
        )}
        <span className="flex-1" />
        {showOutput
          ? run.status === "done" && (
              <>
                {run.seconds !== undefined && (
                  <span className="mr-1 hidden text-[12.5px] text-subtle tabular sm:inline">done in {run.seconds.toFixed(1)}s</span>
                )}
                <Button variant="ghost" size="sm" onClick={() => onReuse(run)}>
                  <RotateCcw /> Reuse
                </Button>
                <Button variant="ghost" size="sm" onClick={() => toast("Download started")}>
                  <Download /> Download
                </Button>
              </>
            )
          : exampleCount > 1 && (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" aria-label="Previous example" onClick={() => step(-1)}>
                  <ChevronLeft />
                </Button>
                <span className="min-w-9 text-center text-[13px] text-muted tabular">
                  {exampleIndex + 1}/{exampleCount}
                </span>
                <Button variant="ghost" size="icon" aria-label="Next example" onClick={() => step(1)}>
                  <ChevronRight />
                </Button>
              </div>
            )}
      </div>

      <div className="grid h-[420px] place-items-center dot-grid p-5 @4xl:h-[min(64vh,580px)]" style={{ containerType: "size" }}>
        {showOutput ? <Frame model={model} run={run} /> : example && <PlaygroundShowcase model={model} example={example} />}
      </div>

      {showOutput ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line px-4 py-3">
          <p className="min-w-0 flex-1 basis-60 truncate text-[13.5px] text-fg/90" title={run.prompt}>
            {run.prompt || <span className="text-muted">No prompt, source only</span>}
          </p>
          <Chips labels={[run.mode, ...run.labels].filter((l): l is string => !!l)} price={formatPrice(run.cost)} />
        </div>
      ) : (
        example && (
          <div className="flex flex-wrap items-end gap-x-4 gap-y-3 border-t border-line px-4 py-3.5">
            <div className="min-w-0 flex-1 basis-72">
              <p className="eyebrow">Prompt</p>
              <p className="mt-1 line-clamp-2 text-[14px] leading-relaxed text-fg/90">{example.prompt}</p>
              <Chips labels={example.labels} className="mt-2.5" />
            </div>
            <Button variant="outline" size="lg" onClick={() => onUseExample(example)}>
              <Wand2 /> Use this prompt
            </Button>
          </div>
        )
      )}
    </div>
  );
}

function Chips({ labels, price, className }: { labels: string[]; price?: string; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {labels.map((label) => (
        <li key={label} className="rounded-md border border-line px-2 py-0.5 text-[12px] text-muted">
          {label}
        </li>
      ))}
      {price && <li className="rounded-md border border-line px-2 py-0.5 text-[12px] text-fg tabular">{price}</li>}
    </ul>
  );
}

function ViewTab({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[14px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
        active ? "bg-white/[0.08] text-fg" : "text-muted hover:bg-white/[0.04] hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function Frame({ model, run }: { model: Model; run: PlaygroundRun }) {
  if (model.modality === "audio") {
    return (
      <div className="relative grid h-28 w-full max-w-xl place-items-center overflow-hidden rounded-xl border border-line bg-canvas">
        {run.status === "done" ? <PlaygroundOutput model={model} run={run} /> : <RenderProgress value={run.progress} />}
      </div>
    );
  }

  const { cols, rows } = gridFor(run.media.length);
  const ratio = (run.ratio * cols) / rows;
  return (
    <div
      key={run.id}
      className="relative overflow-hidden rounded-xl border border-line bg-canvas"
      style={{ aspectRatio: ratio, width: `min(100cqw, ${ratio} * 100cqh)` }}
    >
      {run.status === "done" ? (
        <PlaygroundOutput model={model} run={run} />
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <RenderProgress value={run.progress} />
        </div>
      )}
    </div>
  );
}
