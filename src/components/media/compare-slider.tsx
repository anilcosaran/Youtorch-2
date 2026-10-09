"use client";

import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronsLeftRight } from "lucide-react";

/** Light/dark squares behind transparent results. */
export const checkerboard: CSSProperties = {
  backgroundColor: "#f4f4f2",
  backgroundImage: "conic-gradient(#dcdcd8 25%, transparent 0 50%, #dcdcd8 0 75%, transparent 0)",
  backgroundSize: "18px 18px",
};

/**
 * Before/after wipe that fills its positioned parent. With `sweep` the divider drifts on its own
 * until the first drag or key press.
 */
export function CompareSlider({ before, after, sweep }: { before: ReactNode; after: ReactNode; sweep?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<number>();
  const split = pos === undefined ? "var(--split)" : `${pos}%`;

  const moveTo = (clientX: number) => {
    const box = ref.current?.getBoundingClientRect();
    if (box) setPos(Math.min(100, Math.max(0, ((clientX - box.left) / box.width) * 100)));
  };

  return (
    <div
      ref={ref}
      className={`absolute inset-0 cursor-ew-resize touch-none overflow-hidden select-none ${sweep && pos === undefined ? "motion-safe:animate-split" : ""}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        moveTo(e.clientX);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) moveTo(e.clientX);
      }}
    >
      <div className="absolute inset-0">{after}</div>
      <div className="absolute inset-0" style={{ clipPath: `inset(0 calc(100% - ${split}) 0 0)` }}>
        {before}
      </div>

      <span className="pointer-events-none absolute top-3 left-3 rounded-md bg-[rgb(0_0_0/0.55)] px-2 py-0.5 text-[12px] font-medium text-[#fff] backdrop-blur">
        Before
      </span>
      <span className="pointer-events-none absolute top-3 right-3 rounded-md bg-[rgb(0_0_0/0.55)] px-2 py-0.5 text-[12px] font-medium text-[#fff] backdrop-blur">
        After
      </span>

      <div
        role="slider"
        tabIndex={0}
        aria-label="Before and after"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pos === undefined ? 50 : Math.round(pos)}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          setPos((p = 50) => Math.min(100, Math.max(0, p + (e.key === "ArrowRight" ? 5 : -5))));
        }}
        className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-[#fff] shadow-[0_0_12px_rgb(0_0_0/0.4)]"
        style={{ left: split }}
      >
        <span className="absolute top-1/2 left-1/2 grid size-9 -translate-1/2 place-items-center rounded-full bg-[#fff] text-[#0b0c0f] shadow-lg">
          <ChevronsLeftRight className="size-4" />
        </span>
      </div>
    </div>
  );
}
