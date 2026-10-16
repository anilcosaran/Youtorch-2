"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";
import { Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { Scrubber } from "./scrubber";
import { clock, usePlayhead } from "./use-playhead";

/** Poster-driven stand-in for a rendered clip: a slow push-in plays in sync with the scrubber. Fills its positioned parent. */
export function VideoPreview({
  src,
  alt,
  seconds,
  sizes,
  autoplay,
  eager,
}: {
  src: string;
  alt: string;
  seconds: number;
  sizes: string;
  autoplay?: boolean;
  /** Load the poster right away, for previews above the fold. */
  eager?: boolean;
}) {
  const { time, playing, cue, seek, toggle } = usePlayhead(seconds, autoplay);
  const [muted, setMuted] = useState(true);

  return (
    <div className="group/video absolute inset-0 overflow-hidden bg-canvas">
      <div
        key={cue.n}
        className="absolute inset-0"
        style={{
          animation: `ken-burns ${seconds}s ease-in-out infinite alternate`,
          animationDelay: `-${cue.at}s`,
          animationPlayState: playing ? "running" : "paused",
        }}
      >
        <Image src={src} alt={alt} fill loading={eager ? "eager" : "lazy"} sizes={sizes} className="object-cover" />
      </div>

      <button type="button" onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="absolute inset-0 grid place-items-center">
        {!playing && (
          <span className="grid size-16 place-items-center rounded-full bg-[rgb(0_0_0/0.45)] text-[#fff] ring-1 ring-[rgb(255_255_255/0.25)] backdrop-blur-md transition group-hover/video:scale-105">
            <Play className="size-7 translate-x-0.5 fill-current" />
          </span>
        )}
      </button>

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[rgb(0_0_0/0.7)] to-transparent px-3 pt-12 pb-2 text-[#fff]">
        <Scrubber time={time} duration={seconds} onSeek={seek} className="mx-1 h-5" />
        <div className="mt-0.5 flex items-center gap-1 font-mono text-[13px] tabular">
          <ControlButton label={playing ? "Pause" : "Play"} onClick={toggle}>
            {playing ? <Pause className="size-[18px] fill-current" /> : <Play className="size-[18px] fill-current" />}
          </ControlButton>
          <ControlButton label="Replay" onClick={() => seek(0)}>
            <RotateCcw className="size-4" />
          </ControlButton>
          <span className="ml-1.5">
            {clock(time)} <span className="text-[rgb(255_255_255/0.6)]">/ {clock(seconds)}</span>
          </span>
          <span className="flex-1" />
          <ControlButton label={muted ? "Unmute" : "Mute"} onClick={() => setMuted((m) => !m)}>
            {muted ? <VolumeX className="size-[18px]" /> : <Volume2 className="size-[18px]" />}
          </ControlButton>
        </div>
      </div>
    </div>
  );
}

function ControlButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-9 place-items-center rounded-lg transition hover:bg-[rgb(255_255_255/0.15)]"
    >
      {children}
    </button>
  );
}
