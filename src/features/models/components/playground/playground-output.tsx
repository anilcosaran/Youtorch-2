import { Loader2, Play } from "lucide-react";
import type { Model } from "@/types/model";
import { ModelArt } from "../model-art";

const waveform = Array.from({ length: 40 }, (_, i) => 20 + Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.23)) * 80);

export function PlaygroundOutput({ model, caption }: { model: Model; caption: string }) {
  if (model.modality === "audio") {
    return (
      <div className="absolute inset-0 flex animate-fade-up items-center gap-3 px-4">
        <button aria-label="Play" className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-canvas">
          <Play className="size-4 fill-current" />
        </button>
        <div className="flex h-10 flex-1 items-center gap-[2px]">
          {waveform.map((height, i) => (
            <span key={i} className="flex-1 rounded-full bg-white/70" style={{ height: `${height}%` }} />
          ))}
        </div>
      </div>
    );
  }
  return (
    <>
      <ModelArt model={model} className="absolute inset-0 animate-fade-up" />
      <span className="absolute bottom-2 left-2 rounded-md bg-[rgb(0_0_0/0.6)] px-2 py-1 font-mono text-[11px] text-[#fff] backdrop-blur">
        {caption}
      </span>
    </>
  );
}

export function RenderProgress({ value }: { value: number }) {
  return (
    <div className="w-1/2 text-center">
      <Loader2 className="mx-auto mb-3 size-5 animate-spin text-fg" />
      <div className="h-1 overflow-hidden rounded-full bg-white/[0.08]">
        <div className="h-full rounded-full bg-white transition-[width]" style={{ width: `${value}%` }} />
      </div>
      <p className="mt-2 font-mono text-[12px] text-muted tabular">rendering · {Math.round(value)}%</p>
    </div>
  );
}
