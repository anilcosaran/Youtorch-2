"use client";

import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/cn";
import { Scrubber } from "./scrubber";
import { clock, usePlayhead } from "./use-playhead";

const wave = (count: number) => Array.from({ length: count }, (_, i) => 18 + Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.23)) * 82);
const full = wave(72);
// Gaps are fixed pixels, so narrow cards need fewer bars or the bars collapse to nothing.
const short = wave(28);

/** Waveform player for sample audio; the wave doubles as the seek bar and lights up as it plays. */
export function AudioPreview({ seconds, compact, className }: { seconds: number; compact?: boolean; className?: string }) {
  const { time, playing, seek, toggle } = usePlayhead(seconds);
  const played = time / seconds;
  const bars = compact ? short : full;

  return (
    <div className={cn("flex items-center", compact ? "gap-3" : "gap-4", className)}>
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause" : "Play"}
        className={cn(
          "grid shrink-0 place-items-center rounded-full bg-white text-black transition hover:bg-white/90",
          compact ? "size-10" : "size-12",
        )}
      >
        {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 translate-x-px fill-current" />}
      </button>
      <Scrubber
        time={time}
        duration={seconds}
        onSeek={seek}
        className={cn("min-w-0 flex-1", compact ? "h-12 gap-[2px]" : "h-16 gap-[3px]")}
      >
        {bars.map((height, i) => (
          <span
            key={i}
            className={cn(
              "pointer-events-none flex-1 rounded-full transition-colors",
              i / bars.length < played ? "bg-fg" : "bg-fg/25 group-hover/scrub:bg-fg/40",
            )}
            style={{ height: `${height}%` }}
          />
        ))}
      </Scrubber>
      <span className="w-[5.5rem] shrink-0 text-right font-mono text-[13px] text-muted tabular">
        {clock(time)} / {clock(seconds)}
      </span>
    </div>
  );
}
