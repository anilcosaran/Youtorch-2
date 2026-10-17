"use client";

import { useLayoutEffect, useRef, useState } from "react";

export interface ChartFrame {
  width: number;
  height: number;
  /** Snaps an x offset inside the chart to the nearest device pixel. */
  snapX: (x: number) => number;
  snapY: (y: number) => number;
  /** A whole number of device pixels, close to one CSS pixel. */
  hairline: number;
}

const empty = { width: 0, height: 0, dpr: 1, fx: 0, fy: 0 };

/**
 * Measures the chart box and exposes device-pixel snapping. Bar edges and grid
 * lines that land between physical pixels get anti-aliased into a soft blur,
 * most visibly at fractional display scales like 125%.
 */
export function useChartFrame<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState(empty);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const frac = (v: number) => v * dpr - Math.floor(v * dpr);
      setBox({ width: rect.width, height: rect.height, dpr, fx: frac(rect.left), fy: frac(rect.top + window.scrollY) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { dpr, fx, fy } = box;
  const frame: ChartFrame = {
    width: box.width,
    height: box.height,
    snapX: (x) => (Math.round(x * dpr + fx) - fx) / dpr,
    snapY: (y) => (Math.round(y * dpr + fy) - fy) / dpr,
    hairline: Math.max(1, Math.round(dpr)) / dpr,
  };
  return [ref, frame] as const;
}
