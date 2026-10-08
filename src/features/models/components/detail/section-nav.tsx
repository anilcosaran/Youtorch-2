"use client";

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { detailSections, type DetailSectionId } from "./sections";

const ROW = 38;

export function SectionNav({
  active,
  onJump,
  playgroundOpen,
  onTogglePlayground,
}: {
  active: DetailSectionId;
  onJump: (id: DetailSectionId) => void;
  playgroundOpen: boolean;
  onTogglePlayground: () => void;
}) {
  const activeIndex = detailSections.findIndex((s) => s.id === active);

  return (
    <nav aria-label="Sections" className="hidden @3xl:block">
      <div className="sticky top-8">
        <button
          onClick={onTogglePlayground}
          title={playgroundOpen ? "Close playground" : "Open playground"}
          aria-expanded={playgroundOpen}
          className={cn(
            "mb-2 flex h-9 w-full items-center justify-center gap-2.5 overflow-hidden rounded-md border text-[14px] font-medium whitespace-nowrap transition @5xl:justify-start @5xl:px-3",
            playgroundOpen
              ? "border-white/20 bg-white/[0.08] text-fg"
              : "border-line text-fg hover:border-line-strong hover:bg-white/[0.04]",
          )}
        >
          <Sparkles className="size-4 shrink-0 text-ember-400" />
          <span className="hidden @5xl:inline">Playground</span>
        </button>
        <ul className="relative flex flex-col gap-0.5">
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-9 rounded-md bg-white/[0.08] transition-transform duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)]"
            style={{ transform: `translateY(${Math.max(0, activeIndex) * ROW}px)` }}
          />
          {detailSections.map((s) => (
            <li key={s.id} className="relative">
              <a
                href={`#${s.id}`}
                title={s.label}
                aria-current={active === s.id ? "location" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  onJump(s.id);
                }}
                className={cn(
                  "flex h-9 items-center justify-center gap-2.5 overflow-hidden rounded-md text-[14px] whitespace-nowrap transition-colors duration-300 @5xl:justify-start @5xl:px-3",
                  active === s.id ? "font-medium text-fg" : "text-fg/70 hover:text-fg",
                )}
              >
                <s.icon
                  className={cn("size-4 shrink-0 transition-colors duration-300", active === s.id ? "text-ember-400" : "text-fg/55")}
                />
                <span className="hidden @5xl:inline">{s.label}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
