"use client";

import { useCallback, useState } from "react";

/**
 * Keeps `slots` items on screen and swaps one slot at a time with the head of a
 * queue, so an item never shows twice and every item eventually comes around.
 */
export function useShotRotation(slots: number, total: number) {
  const [state, setState] = useState(() => ({
    shown: Array.from({ length: slots }, (_, i) => i),
    queue: Array.from({ length: Math.max(0, total - slots) }, (_, i) => slots + i),
  }));

  const advance = useCallback(
    (slot: number) =>
      setState(({ shown, queue }) =>
        queue.length
          ? {
              shown: shown.map((p, i) => (i === slot ? queue[0] : p)),
              queue: [...queue.slice(1), shown[slot]],
            }
          : { shown, queue },
      ),
    [],
  );

  return { shown: state.shown, queued: state.queue, advance };
}
