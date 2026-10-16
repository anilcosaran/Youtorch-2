import Link from "next/link";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Model } from "@/types/model";
import type { PlaygroundRun } from "../../lib/playground";
import { OutputThumb } from "./playground-output";

/** This model's recent runs on this device, newest first. Requests from every model and app live in Usage & logs. */
export function PlaygroundHistory({
  model,
  runs,
  selectedId,
  onSelect,
  onClear,
}: {
  model: Model;
  runs: PlaygroundRun[];
  selectedId?: number;
  onSelect: (id: number) => void;
  onClear: () => void;
}) {
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center gap-3">
        <span className="eyebrow">
          History · {runs.length} {runs.length === 1 ? "run" : "runs"}
        </span>
        <span className="flex-1" />
        <Link href="/usage" className="inline-flex items-center gap-1 text-[12.5px] text-muted transition hover:text-fg">
          All activity <ArrowUpRight className="size-3" />
        </Link>
        <button type="button" onClick={onClear} className="text-[12.5px] text-muted transition hover:text-fg">
          Clear
        </button>
      </div>
      <ul className="flex gap-2 overflow-x-auto pb-1">
        {runs.map((run) => {
          const selected = run.id === selectedId;
          return (
            <li key={run.id} className="shrink-0">
              <button
                type="button"
                onClick={() => onSelect(run.id)}
                aria-pressed={selected}
                title={run.prompt}
                className={cn(
                  "relative block h-16 w-28 overflow-hidden rounded-lg border transition",
                  selected ? "border-white/70 ring-2 ring-white/15" : "border-line opacity-70 hover:opacity-100",
                )}
              >
                {run.status === "done" ? (
                  <OutputThumb model={model} run={run} className="absolute inset-0" />
                ) : (
                  <span className="absolute inset-0 grid place-items-center bg-canvas">
                    <Loader2 className="size-4 animate-spin text-muted" />
                    <span className="absolute inset-x-0 bottom-0 h-0.5 bg-white/[0.08]">
                      <span className="block h-full bg-white transition-[width]" style={{ width: `${run.progress}%` }} />
                    </span>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
