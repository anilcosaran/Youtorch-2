"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatUsd } from "@/lib/format";
import { useConsole } from "@/providers/console-provider";
import { navGroups, type NavItem } from "../nav-config";

export function SidebarNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = (item: NavItem) => !item.external && (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href));

  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-3">
      {navGroups.map((group) => (
        <div key={group.label}>
          {!collapsed && <p className="mb-1.5 px-2.5 eyebrow">{group.label}</p>}
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.href}>
                <NavLink item={item} active={isActive(item)} collapsed={collapsed} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function NavLink({ item, active, collapsed, onNavigate }: { item: NavItem; active: boolean; collapsed: boolean; onNavigate?: () => void }) {
  const { balance } = useConsole();
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      target={item.external ? "_blank" : undefined}
      rel={item.external ? "noreferrer" : undefined}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[14px] font-medium transition-colors",
        active ? "bg-white/[0.08] text-fg" : "text-fg/75 hover:bg-white/[0.05] hover:text-fg",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon className={cn("size-[18px] shrink-0", active ? "text-ember-400" : "text-fg/55 group-hover:text-fg")} />
      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
      {!collapsed && item.external && <ArrowUpRight className="size-3.5 text-subtle" />}
      {!collapsed && item.trailing === "balance" && <span className="font-mono text-[12px] text-subtle tabular">{formatUsd(balance)}</span>}
      {!collapsed && item.trailing === "new" && (
        <span className="rounded-md bg-iris-500/15 px-1.5 py-px text-[11px] font-medium text-iris-300">New</span>
      )}
    </Link>
  );
}
