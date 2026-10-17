import Image from "next/image";
import { AudioLines, Loader2 } from "lucide-react";
import { AudioPreview } from "@/components/media/audio-preview";
import { VideoPreview } from "@/components/media/video-preview";
import { cn } from "@/lib/cn";
import type { Model } from "@/types/model";
import type { PlaygroundRun } from "../../lib/playground";
import { ModelArt } from "../model-art";

const sizes = "(min-width: 1280px) 860px, 100vw";

export function gridFor(count: number) {
  const cols = count <= 1 ? 1 : count <= 4 ? 2 : 4;
  return { cols, rows: Math.ceil(count / cols) };
}

export function PlaygroundOutput({ model, run }: { model: Model; run: PlaygroundRun }) {
  if (model.modality === "audio" || run.media.length === 0) {
    return <AudioPreview seconds={8} className="size-full animate-fade-in px-5" />;
  }

  const { cols } = gridFor(run.media.length);
  const alt = run.prompt || model.name;
  return (
    <div className="grid size-full animate-fade-in gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {run.media.map((src, i) => (
        <div key={i} className="relative overflow-hidden">
          {model.modality === "video" ? (
            <VideoPreview src={src} alt={alt} seconds={Number(run.values.duration) || 5} sizes={sizes} autoplay />
          ) : (
            <div className={cn("absolute inset-0", model.modality === "3d" && "animate-ken-burns")}>
              <Image src={src} alt={alt} fill sizes={sizes} className="object-cover" />
            </div>
          )}
          {model.modality === "3d" && (
            <span className="absolute right-2 bottom-2 rounded-md bg-[rgb(0_0_0/0.55)] px-1.5 py-0.5 font-mono text-[11px] text-[#fff] backdrop-blur">
              {String(run.values.format ?? "GLB")}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function OutputThumb({ model, run, className }: { model: Model; run: PlaygroundRun; className?: string }) {
  const src = run.media[0];
  if (!src) {
    return (
      <div className={cn("relative", className)}>
        <ModelArt model={model} className="absolute inset-0" />
        <AudioLines className="absolute inset-0 m-auto size-5 text-[#fff]" />
      </div>
    );
  }
  return (
    <div className={cn("relative", className)}>
      <Image src={src} alt="" fill sizes="112px" className="object-cover" />
    </div>
  );
}

export function RenderProgress({ value }: { value: number }) {
  return (
    <div className="w-1/2 max-w-64 text-center">
      <Loader2 className="mx-auto mb-3 size-5 animate-spin text-fg" />
      <div className="h-1 overflow-hidden rounded-full bg-white/[0.08]">
        <div className="h-full rounded-full bg-white transition-[width]" style={{ width: `${value}%` }} />
      </div>
      <p className="mt-2 font-mono text-[12px] text-muted tabular">generating · {Math.round(value)}%</p>
    </div>
  );
}
