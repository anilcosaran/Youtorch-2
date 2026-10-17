"use client";

import { cn } from "@/lib/cn";
import { Sidebar } from "./sidebar/sidebar";

export function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <div
      className={cn("fixed inset-0 z-50 lg:hidden", open ? "pointer-events-auto" : "pointer-events-none")}
      aria-hidden={!open}
      inert={!open}
    >
      <div
        onClick={onClose}
        className={cn("absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity", open ? "opacity-100" : "opacity-0")}
      />
      <aside
        className={cn(
          "absolute inset-y-0 left-0 w-[272px] border-r border-line bg-surface transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <Sidebar collapsed={false} onNavigate={onClose} />
      </aside>
    </div>
  );
}
