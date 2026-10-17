"use client";

import { useSyncExternalStore } from "react";

// One shared clock that ticks every 30 seconds while something is watching it,
// so "in 5 minutes" and "Today" stay true without a timer per component.
const TICK_MS = 30_000;
const listeners = new Set<() => void>();
let now = new Date();
let timer: ReturnType<typeof setInterval> | undefined;

function tick() {
  now = new Date();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  if (Date.now() - now.getTime() > TICK_MS) now = new Date();
  listeners.add(listener);
  timer ??= setInterval(tick, TICK_MS);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

const snapshot = () => now;

/** The current time, refreshed every 30 seconds. */
export function useNow(): Date {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
