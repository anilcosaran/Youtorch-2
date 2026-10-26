"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { panelId, tabId, type ModelTab, type ModelTabId } from "./tabs";

export function ModelTabs({ tabs, active, onSelect }: { tabs: ModelTab[]; active: ModelTabId; onSelect: (id: ModelTabId) => void }) {
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLElement>(`#${tabId(active)}`);
    if (!el) return;
    const measure = () => setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    if (list.scrollWidth > list.clientWidth) {
      list.scrollTo({ left: el.offsetLeft - (list.clientWidth - el.offsetWidth) / 2, behavior: "smooth" });
    }
    return () => observer.disconnect();
  }, [active, tabs.length]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = tabs.findIndex((t) => t.id === active);
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
    onSelect(next.id);
    listRef.current?.querySelector<HTMLElement>(`#${tabId(next.id)}`)?.focus();
  };

  return (
    <div className="sticky top-14 z-20 -mx-4 bg-canvas/85 px-4 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-8 lg:px-8">
      <div
        ref={listRef}
        role="tablist"
        aria-label="Model sections"
        onKeyDown={onKeyDown}
        className="relative flex [scrollbar-width:none] gap-1 overflow-x-auto border-b border-line"
      >
        {tabs.map((t) => {
          const selected = t.id === active;
          return (
            <button
              key={t.id}
              id={tabId(t.id)}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={panelId(t.id)}
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(t.id)}
              className="group flex h-12 shrink-0 items-center px-0.5 outline-none"
            >
              <span
                className={cn(
                  "flex h-9 items-center gap-2 rounded-lg px-3 text-[14px] font-medium whitespace-nowrap transition-colors duration-150 group-focus-visible:ring-2 group-focus-visible:ring-ember-400 group-active:bg-white/[0.08]",
                  selected ? "text-fg" : "text-fg/60 group-hover:bg-white/[0.05] group-hover:text-fg",
                )}
              >
                <t.icon className={cn("size-4 shrink-0 transition-colors", selected ? "text-ember-400" : "text-fg/50")} />
                {t.label}
              </span>
            </button>
          );
        })}
        {indicator && (
          <span
            aria-hidden
            className="absolute bottom-0 h-0.5 rounded-full bg-ember-400 transition-[left,width] duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)]"
            style={{ left: indicator.left + 2, width: indicator.width - 4 }}
          />
        )}
      </div>
    </div>
  );
}
