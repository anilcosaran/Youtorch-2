"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { carryState, encodeQuery, PANEL_PARAM } from "./panel";

type Patch = Record<string, string | null | undefined>;

/** Parameters that don't change what a list shows, so setting them keeps its page. */
const KEEPS_PAGE = new Set(["cursor", PANEL_PARAM]);

/**
 * The query string after a change: empty values are removed, and a change to
 * anything but the cursor or the open panel goes back to the first page.
 */
export function patchQuery(current: string, patch: Patch): string {
  const next = new URLSearchParams(current);
  for (const [key, value] of Object.entries(patch)) {
    if (value) next.set(key, value);
    else next.delete(key);
  }
  if (!Object.keys(patch).every((key) => KEEPS_PAGE.has(key))) next.delete("cursor");
  return encodeQuery(next);
}

/**
 * Filters, search and paging live in the query string so a view can be
 * shared and survives a reload. Changes replace the history entry; any change
 * other than the cursor or the open panel goes back to the first page.
 */
export function useUrlState() {
  const params = useSearchParams();
  const pathname = usePathname();

  const get = useCallback((key: string) => params.get(key) || undefined, [params]);

  // The history API updates the URL and useSearchParams without a round trip
  // to the server, so tabs and filters switch at once.
  const set = useCallback(
    (patch: Patch) => {
      const query = patchQuery(window.location.search, patch);
      window.history.replaceState(carryState(window.history.state), "", query ? `${pathname}?${query}` : pathname);
    },
    [pathname],
  );

  return { get, set };
}

/** Reads a query parameter restricted to known values. */
export function pick<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return allowed.find((option) => option === value);
}

/**
 * Cursor paging on top of `useUrlState`. The cursor of the page shown is in
 * the URL; the cursors of the pages before it are remembered in memory, so
 * "Previous" works within a visit and falls back to the first page otherwise.
 */
export function usePager() {
  const { get, set } = useUrlState();
  const cursor = get("cursor");
  const [trail, setTrail] = useState<string[]>([]);
  // Back on the first page (a filter changed, or "First page"): forget the trail.
  if (!cursor && trail.length > 0) setTrail([]);

  const next = (nextCursor: string) => {
    setTrail((t) => [...t, cursor ?? ""]);
    set({ cursor: nextCursor });
  };
  const previous = () => {
    const before = trail.at(-1);
    setTrail((t) => t.slice(0, -1));
    set({ cursor: before || null });
  };

  return {
    cursor,
    /** Known only when the visit started on the first page. */
    page: !cursor ? 1 : trail.length > 0 ? trail.length + 1 : null,
    hasPrevious: Boolean(cursor),
    next,
    previous,
  };
}

export type Pager = ReturnType<typeof usePager>;
