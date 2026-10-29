"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useConsole } from "@/providers/console-provider";
import type { PlaygroundRun } from "../../lib/playground";

const MAX_RUNS = 24;
const EMPTY: PlaygroundRun[] = [];

/** Bump when the stored shape changes; older entries are then ignored instead of misread. */
const VERSION = 1;

/** Runs hold prompts and upload thumbnails, so they are kept per workspace and never shared between them. */
const storageKey = (workspace: string, scope: string) => `modelvend:v${VERSION}:${workspace}:runs:${scope}`;

/** Before versioning, runs were stored per model with no workspace; those are dropped. */
const legacyKey = (scope: string) => `modelvend:playground:${scope}`;

const cache = new Map<string, PlaygroundRun[]>();
const persisted = new Map<string, string>();
const listeners = new Set<() => void>();

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === "string");
const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isString = (v: unknown): v is string => typeof v === "string";
const optional = <T>(v: unknown, check: (v: unknown) => v is T) => v === undefined || check(v);

/** Accepts only finished runs in the current shape. */
function isRun(v: unknown): v is PlaygroundRun {
  return (
    isRecord(v) &&
    isFiniteNumber(v.id) &&
    isString(v.prompt) &&
    optional(v.mode, isString) &&
    isRecord(v.values) &&
    Object.values(v.values).every((x) => typeof x === "string" || typeof x === "boolean") &&
    isStrings(v.labels) &&
    isFiniteNumber(v.cost) &&
    isFiniteNumber(v.ratio) &&
    v.ratio > 0 &&
    isStrings(v.media) &&
    optional(v.source, isString) &&
    v.status === "done" &&
    isFiniteNumber(v.progress) &&
    optional(v.seconds, isFiniteNumber)
  );
}

/** Parses stored history, keeping the entries that match and dropping the rest. */
function parse(raw: string | null): PlaygroundRun[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data) || data.v !== VERSION || !Array.isArray(data.runs)) return [];
    return data.runs.filter(isRun).slice(0, MAX_RUNS);
  } catch {
    return [];
  }
}

function read(key: string, scope: string) {
  let runs = cache.get(key);
  if (!runs) {
    try {
      localStorage.removeItem(legacyKey(scope));
      runs = parse(localStorage.getItem(key));
    } catch {
      runs = [];
    }
    cache.set(key, runs);
  }
  return runs;
}

function write(key: string, runs: PlaygroundRun[]) {
  cache.set(key, runs);
  // Only finished runs are stored; progress ticks don't touch localStorage.
  const finished = JSON.stringify({ v: VERSION, runs: runs.filter((r) => r.status === "done").slice(0, MAX_RUNS) });
  if (persisted.get(key) !== finished) {
    persisted.set(key, finished);
    try {
      localStorage.setItem(key, finished);
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

/** Runs for one model or app (`scope`) in the current workspace, newest first, kept across visits on this device. */
export function useRunHistory(scope: string) {
  const { workspace } = useConsole();
  const key = storageKey(workspace.id, scope);
  const runs = useSyncExternalStore(
    subscribe,
    () => read(key, scope),
    () => EMPTY,
  );
  const update = useCallback((fn: (runs: PlaygroundRun[]) => PlaygroundRun[]) => write(key, fn(read(key, scope))), [key, scope]);
  return [runs, update] as const;
}
