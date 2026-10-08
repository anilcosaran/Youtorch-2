"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { MobileDrawer } from "./mobile-drawer";
import { SidePanelHost, useSidePanel } from "./side-panel";
import { Sidebar } from "./sidebar/sidebar";
import { Topbar } from "./topbar";

export function ShellFrame({ children }: { children: ReactNode }) {
  const { open: panelOpen } = useSidePanel();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedWithPanel, setExpandedWithPanel] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [prevPanelOpen, setPrevPanelOpen] = useState(panelOpen);

  // The sidebar folds away while the side panel is open; each opening starts folded again.
  if (prevPanelOpen !== panelOpen) {
    setPrevPanelOpen(panelOpen);
    setExpandedWithPanel(false);
  }
  const isCollapsed = panelOpen ? !expandedWithPanel : collapsed;
  const toggle = () => (panelOpen ? setExpandedWithPanel((v) => !v) : setCollapsed((c) => !c));

  return (
    <div className="relative flex min-h-dvh">
      <aside
        className={cn(
          "sticky top-0 z-40 hidden h-dvh shrink-0 border-r border-line bg-canvas transition-[width] duration-500 ease-[cubic-bezier(0.2,0.7,0.2,1)] lg:block",
          isCollapsed ? "w-[68px]" : "w-[264px]",
        )}
      >
        <Sidebar collapsed={isCollapsed} onToggleCollapsed={toggle} />
      </aside>

      <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div className="relative flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMenu={() => setMobileOpen(true)} />
        <main id="main" className="mx-auto w-full max-w-[1760px] flex-1 px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
      <SidePanelHost />
    </div>
  );
}
