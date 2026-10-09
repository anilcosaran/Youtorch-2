"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { PlaygroundRun } from "../../lib/playground";

const MAX_RUNS = 24;
const EMPTY: PlaygroundRun[] = [];
const storageKey = (slug: string) => `youtorch:playground:${slug}`;

const cache = new Map<string, PlaygroundRun[]>();
const persisted = new Map<string, string>();
const listeners = new Set<() => void>();

function read(slug: string) {
  let runs = cache.get(slug);
  if (!runs) {
    try {
      runs = JSON.parse(localStorage.getItem(storageKey(slug)) ?? "[]") as PlaygroundRun[];
    } catch {
      runs = [];
    }
    cache.set(slug, runs);
  }
  return runs;
}

function write(slug: string, runs: PlaygroundRun[]) {
  cache.set(slug, runs);
  // Only finished runs are stored; progress ticks don't touch localStorage.
  const finished = JSON.stringify(runs.filter((r) => r.status === "done").slice(0, MAX_RUNS));
  if (persisted.get(slug) !== finished) {
    persisted.set(slug, finished);
    try {
      localStorage.setItem(storageKey(slug), finished);
    } catch {
      // Storage full or disabled: history still works for this visit.
    }
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Playground runs for one model, newest first, kept across visits on this device. */
export function useRunHistory(slug: string) {
  const runs = useSyncExternalStore(
    subscribe,
    () => read(slug),
    () => EMPTY,
  );
  const update = useCallback((fn: (runs: PlaygroundRun[]) => PlaygroundRun[]) => write(slug, fn(read(slug))), [slug]);
  return [runs, update] as const;
}
