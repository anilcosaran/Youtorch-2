"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

interface SidePanelState {
  host: HTMLElement | null;
  setHost: (el: HTMLElement | null) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}

const SidePanelContext = createContext<SidePanelState | null>(null);

export function useSidePanel() {
  const ctx = useContext(SidePanelContext);
  if (!ctx) throw new Error("useSidePanel must be used inside <SidePanelProvider>");
  return ctx;
}

export function SidePanelProvider({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ host, setHost, open, setOpen }), [host, open]);
  return <SidePanelContext.Provider value={value}>{children}</SidePanelContext.Provider>;
}

/**
 * Full-height column on the right edge of the shell. On xl screens it takes
 * layout space and pushes the page left; below that it slides over as a drawer.
 */
export function SidePanelHost() {
  const { setHost, open } = useSidePanel();
  return (
    <aside
      inert={!open}
      aria-hidden={!open}
      className={cn(
        "z-40 shrink-0 overflow-hidden bg-surface transition-[width,translate] duration-500 ease-[cubic-bezier(0.2,0.7,0.2,1)]",
        "max-xl:fixed max-xl:inset-y-0 max-xl:right-0 max-xl:w-[min(440px,100vw)] max-xl:shadow-2xl max-xl:shadow-black/50",
        "xl:sticky xl:top-0 xl:h-dvh",
        open ? "max-xl:translate-x-0 xl:w-[440px]" : "max-xl:translate-x-full xl:w-0",
      )}
    >
      <div ref={setHost} className="h-dvh w-[min(440px,100vw)] border-l border-line xl:w-[440px]" />
    </aside>
  );
}

/** Renders its children into the shell's side panel and opens it while `open` is true. */
export function SidePanel({ open, children }: { open: boolean; children: ReactNode }) {
  const { host, setOpen } = useSidePanel();

  useEffect(() => {
    setOpen(open);
  }, [open, setOpen]);

  useEffect(() => () => setOpen(false), [setOpen]);

  return host ? createPortal(children, host) : null;
}
