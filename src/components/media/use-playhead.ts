"use client";

import { useEffect, useState } from "react";

/**
 * Looping clock for mock media players. Autoplay is skipped when the user prefers reduced motion.
 * `cue` changes on every seek so time-synced animations can restart from `cue.at`.
 */
export function usePlayhead(duration: number, autoplay = false) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [cue, setCue] = useState({ n: 0, at: 0 });

  useEffect(() => {
    if (autoplay && !matchMedia("(prefers-reduced-motion: reduce)").matches) setPlaying(true);
  }, [autoplay]);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      setTime((t) => (t + (now - last) / 1000) % duration);
      last = now;
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, duration]);

  const seek = (seconds: number) => {
    const at = Math.min(duration - 0.01, Math.max(0, seconds));
    setTime(at);
    setCue((c) => ({ n: c.n + 1, at }));
  };

  return { time, playing, cue, seek, toggle: () => setPlaying((p) => !p) };
}

export const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
