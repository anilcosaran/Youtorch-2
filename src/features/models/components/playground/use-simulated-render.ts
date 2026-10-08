"use client";

import { useEffect, useRef } from "react";

/** Mock render job: ticks progress towards 100 and then resolves. Timers are cleared on unmount. */
export function useSimulatedRender() {
  const timers = useRef(new Set<ReturnType<typeof setInterval>>());

  useEffect(() => {
    const active = timers.current;
    return () => active.forEach(clearInterval);
  }, []);

  return (onProgress: (percent: number) => void, onDone: () => void) => {
    let value = 0;
    const timer = setInterval(() => {
      value += 5 + Math.random() * 10;
      if (value < 100) return onProgress(value);
      clearInterval(timer);
      timers.current.delete(timer);
      onDone();
    }, 150);
    timers.current.add(timer);
  };
}
