"use client";

import { LogoMark } from "@/components/brand/logo";
import { cn } from "@/lib/cn";
import { useConsole } from "@/providers/console-provider";

/** The current workspace. Plain text until sub-accounts exist and there is something to switch to. */
export function WorkspaceSwitcher({ collapsed }: { collapsed: boolean }) {
  const { workspace } = useConsole();
  return (
    <div className={cn("flex min-w-0 flex-1 items-center gap-2.5 p-1.5", collapsed && "flex-none")}>
      <LogoMark />
      {!collapsed && (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] leading-tight font-semibold">{workspace.name}</span>
          <span className="block truncate text-[12px] text-subtle">{workspace.plan}</span>
        </span>
      )}
    </div>
  );
}
