"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { useConsole } from "@/providers/console-provider";
import { ThemeSwitch } from "../theme-switch";
import { PanelIcon } from "./panel-icon";
import { SidebarNav } from "./sidebar-nav";
import { UserAvatar, UserRow } from "./user-row";
import { WorkspaceSwitcher } from "./workspace-switcher";

export function Sidebar({
  collapsed,
  onToggleCollapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
}) {
  const { openDialog } = useConsole();

  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex items-center gap-2 px-3 pt-3 pb-2", collapsed && "flex-col")}>
        <WorkspaceSwitcher collapsed={collapsed} />
        {onToggleCollapsed && (
          <button
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="grid size-7 place-items-center rounded-md text-subtle transition hover:bg-white/5 hover:text-fg"
          >
            <PanelIcon />
          </button>
        )}
      </div>

      <div className="px-3 pb-2">
        <button
          onClick={() => openDialog("command")}
          className={cn(
            "flex h-8 w-full items-center gap-2 rounded-lg border border-line bg-white/[0.02] px-2.5 text-[14px] text-subtle transition hover:border-line-strong hover:text-muted",
            collapsed && "justify-center px-0",
          )}
        >
          <Search className="size-3.5" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Search…</span>
              <kbd className="rounded border border-line px-1 font-mono text-[11px]">Ctrl K</kbd>
            </>
          )}
        </button>
      </div>

      <SidebarNav collapsed={collapsed} onNavigate={onNavigate} />

      {collapsed ? (
        <div className="flex flex-col items-center gap-2 p-3">
          <ThemeSwitch compact />
          <UserAvatar />
        </div>
      ) : (
        <div className="space-y-2 p-3">
          <ThemeSwitch />
          <UserRow />
        </div>
      )}
    </div>
  );
}
