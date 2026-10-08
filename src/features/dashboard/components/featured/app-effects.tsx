import Image from "next/image";
import { ChevronsLeftRight, Play } from "lucide-react";
import { cn } from "@/lib/cn";
import type { AppEffect } from "@/mocks/dashboard";

export const tileSizes = "(min-width: 1024px) 22vw, 50vw";
export const tileImageClass = "object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]";

const checker = "repeating-conic-gradient(#e4e4e7 0 25%, #fafafa 0 50%) 0 0 / 10px 10px";
const voiceBars = [0.5, 0.85, 0.6, 1, 0.7, 0.95, 0.45, 0.8, 0.55, 0.9, 0.5];

/*
 * Split effects read `--split` (animated by `animate-split` on the tile) so the
 * clip edge, the divider and the handle stay in lockstep.
 */

/** After side of the background remover: transparent PNG over a checkerboard. */
export function CutoutLayer({ src, objectPosition }: { src: string; objectPosition: string }) {
  return (
    <div className="absolute inset-0 -z-10" style={{ background: checker, clipPath: "inset(0 0 0 var(--split))" }}>
      <Image src={src} alt="" fill sizes={tileSizes} className={tileImageClass} style={{ objectPosition }} />
    </div>
  );
}

/** Before side of the upscaler: a tiny rendition stretched with hard pixels. */
export function UpscaleLayer({ src, objectPosition }: { src: string; objectPosition: string }) {
  return (
    <div className="absolute inset-0 -z-10" style={{ clipPath: "inset(0 calc(100% - var(--split)) 0 0)" }}>
      <Image src={src} alt="" fill sizes="96px" className={cn(tileImageClass, "[image-rendering:pixelated]")} style={{ objectPosition }} />
    </div>
  );
}

export function SplitHandle() {
  return (
    <>
      <span className="pointer-events-none absolute inset-y-0 left-[var(--split)] w-[2px] -translate-x-1/2 bg-[#fff] shadow-[0_0_10px_rgb(0_0_0/0.45)]" />
      <span className="pointer-events-none absolute top-[34%] left-[var(--split)] grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[#fff] text-[#0b0c0f] shadow-[0_2px_12px_rgb(0_0_0/0.4)]">
        <ChevronsLeftRight className="size-3.5" />
      </span>
    </>
  );
}

export function MotionProgress() {
  return (
    <span className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden bg-[rgb(255_255_255/0.18)]">
      <span className="block h-full animate-sweep bg-[#fff]" style={{ animationDuration: "8s", animationIterationCount: "infinite" }} />
    </span>
  );
}

/** Corner chips that hint at what the tile does; `start` only renders when the tile has no badge. */
export function EffectChips({ effect, side }: { effect: AppEffect; side: "start" | "end" }) {
  if (side === "start") return effect === "upscale" ? <ResolutionChip>1K</ResolutionChip> : <span />;

  switch (effect) {
    case "motion":
      return (
        <span className="flex items-center gap-1.5 rounded-full bg-[rgb(0_0_0/0.4)] py-1 pr-2 pl-1.5 text-[11px] font-medium text-[#fff] backdrop-blur-md">
          <Play className="size-3 fill-current" />
          <span className="tabular">0:08</span>
        </span>
      );
    case "upscale":
      return <ResolutionChip>4K</ResolutionChip>;
    case "voice":
      return (
        <span className="flex h-6 items-center gap-[3px]" aria-hidden>
          {voiceBars.map((h, i) => (
            <span
              key={i}
              className="w-[3px] origin-center animate-eq rounded-full bg-[#fff]"
              style={{ height: `${h * 100}%`, animationDelay: `${-i * 170}ms`, animationDuration: `${0.9 + (i % 4) * 0.15}s` }}
            />
          ))}
        </span>
      );
    default:
      return null;
  }
}

function ResolutionChip({ children }: { children: string }) {
  return (
    <span className="rounded-md bg-[rgb(0_0_0/0.45)] px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-[#fff] backdrop-blur-md">
      {children}
    </span>
  );
}
