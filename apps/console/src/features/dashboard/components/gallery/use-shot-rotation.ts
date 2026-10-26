"use client";

import { useCallback, useState } from "react";

/**
 * Keeps up to `slots` items on screen and swaps one slot at a time with the head of a
 * queue, so an item never shows twice and every item eventually comes around. With
 * fewer items than slots, `shown` is shorter and nothing rotates.
 */
export function useShotRotation(slots: number, total: number) {
  const [state, setState] = useState(() => {
    const visible = Math.max(0, Math.min(slots, total));
    return {
      shown: Array.from({ length: visible }, (_, i) => i),
      queue: Array.from({ length: Math.max(0, total - visible) }, (_, i) => visible + i),
    };
  });

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
