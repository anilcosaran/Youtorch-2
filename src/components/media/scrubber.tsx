"use client";

import { useRef, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { clock } from "./use-playhead";

/**
 * Seek control: click or drag anywhere on it, or use the arrow keys (±1s, Shift ±5s).
 * Renders the default track unless `children` draws its own (e.g. a waveform).
 */
export function Scrubber({
  time,
  duration,
  onSeek,
  className,
  children,
}: {
  time: number;
  duration: number;
  onSeek: (seconds: number) => void;
  className?: string;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fraction = time / duration;

  const seekTo = (e: PointerEvent) => {
    const box = ref.current?.getBoundingClientRect();
    if (box) onSeek(((e.clientX - box.left) / box.width) * duration);
  };

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(time)}
      aria-valuetext={`${clock(time)} of ${clock(duration)}`}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        seekTo(e);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) seekTo(e);
      }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        const step = e.shiftKey ? 5 : 1;
        onSeek(time + (e.key === "ArrowRight" ? step : -step));
      }}
      className={cn("group/scrub relative flex cursor-pointer touch-none items-center select-none", className)}
    >
      {children ?? (
        <>
          <span className="relative h-1.5 w-full overflow-hidden rounded-full bg-[rgb(255_255_255/0.25)] transition-[height] group-hover/scrub:h-2">
            <span className="absolute inset-y-0 left-0 rounded-full bg-[#fff]" style={{ width: `${fraction * 100}%` }} />
          </span>
          <span
            className="pointer-events-none absolute top-1/2 size-3.5 -translate-1/2 rounded-full bg-[#fff] shadow-[0_0_0_4px_rgb(0_0_0/0.25)] transition-transform group-hover/scrub:scale-110"
            style={{ left: `${fraction * 100}%` }}
          />
        </>
      )}
    </div>
  );
}
