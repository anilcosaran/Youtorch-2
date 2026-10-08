import { ChevronsUpDown } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { site } from "@/config/site";
import { cn } from "@/lib/cn";

export function WorkspaceSwitcher({ collapsed }: { collapsed: boolean }) {
  return (
    <button
      className={cn(
        "group flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1.5 text-left transition hover:bg-white/[0.04]",
        collapsed && "flex-none",
      )}
    >
      <LogoMark />
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] leading-tight font-semibold">{site.workspace.name}</span>
            <span className="block truncate text-[12px] text-subtle">{site.workspace.plan}</span>
          </span>
          <ChevronsUpDown className="size-3.5 text-subtle group-hover:text-muted" />
        </>
      )}
    </button>
  );
}
