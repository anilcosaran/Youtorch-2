"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Suspense, useState } from "react";
import { ChevronsUpDown, KeyRound, LogOut, Moon, PanelLeft, Search, Sun } from "lucide-react";
import { Monogram } from "@/components/shared/monogram";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChangePasswordDialog } from "@/features/auth/change-password-dialog";
import type { Operator } from "@/lib/api/auth";
import { keys } from "@/lib/api/keys";
import { getPermissionCatalog } from "@/lib/api/operators";
import { listProviders } from "@/lib/api/providers";
import { BRAND } from "@/lib/brand";
import { badgeCount } from "@/lib/format";
import { accessLabel } from "@/lib/permissions";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { useCommandPalette, useShortcutLabel } from "./command-palette";
import { Logo } from "./logo";
import { isActive, visibleNav, type NavItem } from "./nav";
import { useSidebarCollapsed } from "./use-sidebar";

/** Providers that are degraded or down, refreshed every minute, for operators who see providers. */
function useProviderAlerts(): string | null {
  const { can } = useSession();
  const alerts = useQuery({
    queryKey: keys.providers,
    queryFn: listProviders,
    enabled: can.viewProviders,
    refetchInterval: 60_000,
    meta: { silent: true },
    select: (providers) => {
      const n = providers.filter((p) => p.status === "active" && p.health.state !== "operational").length;
      return n > 0 ? badgeCount(n) : null;
    },
  });
  return alerts.data ?? null;
}

const rowButton =
  "outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[state=open]:bg-sidebar-accent";

/** Icon-only controls in the folded rail get their label as a tooltip. */
function RailTip({ show, label, children }: { show: boolean; label: string; children: React.ReactElement }) {
  if (!show) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function NavLink({
  item,
  active,
  alerts,
  rail,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  alerts: string | null;
  rail: boolean;
  onNavigate?: () => void;
}) {
  const badge = item.badge === "providers" ? alerts : null;
  const warning = item.tone === "warning" && badge !== null;
  return (
    <RailTip show={rail} label={badge ? `${item.label} · ${badge} need attention` : item.label}>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        aria-label={rail ? item.label : undefined}
        className={cn(
          "relative flex h-9 items-center rounded-lg text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          rail ? "w-10 justify-center" : "gap-3 px-2.5",
          active
            ? "bg-sidebar-accent text-foreground"
            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
        )}
      >
        <item.icon className={cn("size-[18px] shrink-0", warning && "text-warning")} strokeWidth={1.75} aria-hidden />
        {!rail && <span className="truncate">{item.label}</span>}
        {badge &&
          (rail ? (
            <span
              aria-hidden
              className={cn("absolute top-1.5 right-1.5 size-1.5 rounded-full", warning ? "bg-warning" : "bg-foreground")}
            />
          ) : (
            <span
              aria-hidden
              className={cn(
                "ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1.5 text-[11px] font-semibold tabular ring-1 ring-inset",
                warning
                  ? "bg-warning/15 text-warning ring-warning/25"
                  : "bg-foreground/10 text-foreground ring-foreground/10",
              )}
            >
              {badge}
            </span>
          ))}
        {badge && <span className="sr-only">, {badge} need attention</span>}
      </Link>
    </RailTip>
  );
}

function NavLinks({
  pathname,
  rail,
  onNavigate,
}: {
  pathname: string;
  rail: boolean;
  onNavigate?: () => void;
}) {
  const { operator, allows } = useSession();
  const alerts = useProviderAlerts();
  if (!operator) return <NavSkeleton rail={rail} />;
  return (
    <nav aria-label="Console" className={cn("flex flex-col gap-4", rail && "items-center")}>
      {visibleNav(allows).map((group, i) => {
        const labelId = group.label ? `nav-group-${group.label.toLowerCase()}` : undefined;
        return (
          <div key={group.label ?? i} role="group" aria-labelledby={labelId} className="flex flex-col gap-0.5">
            {group.label &&
              (rail ? (
                <div aria-hidden className="mx-auto mb-2 h-px w-6 bg-sidebar-border" />
              ) : (
                <div id={labelId} className="px-2.5 pb-1.5 text-xs font-medium text-muted-foreground">
                  {group.label}
                </div>
              ))}
            {group.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isActive(pathname, item.href)}
                alerts={alerts}
                rail={rail}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        );
      })}
    </nav>
  );
}

/** Which pages show depends on the operator, so the list waits for them. */
function NavSkeleton({ rail }: { rail: boolean }) {
  return (
    <div aria-busy="true" aria-label="Loading" className={cn("flex flex-col gap-0.5", rail && "items-center")}>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className={cn("flex h-9 items-center", rail ? "w-10 justify-center" : "gap-3 px-2.5")}>
          <Skeleton className="size-[18px] shrink-0 rounded-md" />
          {!rail && <Skeleton className="h-3 w-24" />}
        </div>
      ))}
    </div>
  );
}

// `usePathname` can suspend while the route is resolved, so the nav renders
// without an active item until the path is known.
function ActiveNav(props: { rail: boolean; onNavigate?: () => void }) {
  return <NavLinks pathname={usePathname()} {...props} />;
}

function SearchButton({ rail, onNavigate }: { rail: boolean; onNavigate?: () => void }) {
  const openPalette = useCommandPalette();
  const shortcut = useShortcutLabel();
  const open = () => {
    onNavigate?.();
    openPalette();
  };
  return (
    <RailTip show={rail} label={`Search · ${shortcut}`}>
      <button
        type="button"
        aria-label={rail ? "Search" : undefined}
        aria-keyshortcuts="Control+K Meta+K"
        onClick={open}
        className={cn(
          "flex items-center rounded-lg border bg-card text-sm text-muted-foreground shadow-xs hover:text-foreground",
          rowButton,
          rail ? "size-10 justify-center" : "h-10 w-full gap-2.5 px-3",
        )}
      >
        <Search className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
        {!rail && (
          <>
            <span>Search</span>
            <kbd className="ml-auto rounded border bg-muted/60 px-1.5 py-0.5 font-sans text-[11px] leading-none font-medium text-muted-foreground">
              {shortcut}
            </kbd>
          </>
        )}
      </button>
    </RailTip>
  );
}

function Brand({ rail, onNavigate }: { rail: boolean; onNavigate?: () => void }) {
  return (
    <RailTip show={rail} label={BRAND.name}>
      <Link
        href="/"
        onClick={onNavigate}
        aria-label={rail ? BRAND.name : undefined}
        className={cn(
          "flex items-center rounded-lg",
          rowButton,
          rail ? "size-10 justify-center" : "min-w-0 flex-1 gap-2.5 p-1.5",
        )}
      >
        <Logo className="size-7" />
        {!rail && <span className="truncate text-[15px] font-semibold tracking-tight">{BRAND.name}</span>}
      </Link>
    </RailTip>
  );
}

function CollapseToggle({ rail, onToggle }: { rail: boolean; onToggle: () => void }) {
  const label = rail ? "Expand sidebar" : "Collapse sidebar";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onToggle}
          className={cn(
            "inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground",
            rowButton,
          )}
        >
          <PanelLeft className="size-[18px]" strokeWidth={1.75} />
        </button>
      </TooltipTrigger>
      <TooltipContent side={rail ? "right" : "bottom"}>{label}</TooltipContent>
    </Tooltip>
  );
}

/** "Admin", the preset their access matches, or "Custom · N permissions". Loads the presets when shown. */
function AccessText({ operator }: { operator: Operator }) {
  const catalog = useQuery({
    queryKey: keys.permissionCatalog,
    queryFn: getPermissionCatalog,
    staleTime: 30 * 60_000,
    enabled: operator.role !== "admin",
    meta: { silent: true },
  });
  return <>{accessLabel(operator, catalog.data?.presets ?? [])}</>;
}

function OperatorMenu({ rail }: { rail: boolean }) {
  const { operator, signOut } = useSession();
  const { theme, setTheme } = useTheme();
  const [changing, setChanging] = useState(false);
  if (!operator) {
    return (
      <div className={cn("flex items-center gap-2.5 p-1.5", !rail && "w-full")} aria-busy="true" aria-label="Loading">
        <Skeleton className="size-8 rounded-full" />
        {!rail && (
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-2.5 w-32" />
          </div>
        )}
      </div>
    );
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={rail ? `${operator.name}, account menu` : undefined}
            className={cn(
              "flex items-center rounded-lg text-left",
              rowButton,
              rail ? "size-10 justify-center" : "w-full gap-2.5 p-1.5",
            )}
          >
            <Monogram name={operator.name} className="size-8 text-[11px]" />
            {!rail && (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm leading-tight font-medium">{operator.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{operator.email}</span>
                </span>
                <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
              </>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side={rail ? "right" : "top"} align={rail ? "end" : "start"} className="w-60">
          <DropdownMenuLabel className="font-normal">
            <span className="block truncate text-sm font-medium text-foreground">{operator.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              <AccessText operator={operator} />
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme ?? "dark"} onValueChange={setTheme}>
            <DropdownMenuRadioItem value="light">
              <Sun /> Light
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">
              <Moon /> Dark
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setChanging(true)}>
            <KeyRound /> Change password
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void signOut()}>
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePasswordDialog open={changing} onOpenChange={setChanging} />
    </>
  );
}

/**
 * Sidebar body, shared by the desktop column and the sheet on narrow screens.
 * `onToggle` adds the fold button (desktop only); `rail` says it is folded.
 */
export function SidebarContent({
  rail = false,
  onToggle,
  onNavigate,
}: {
  rail?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
}) {
  return (
    <div className={cn("flex h-full flex-col gap-3 py-3", rail ? "items-center px-2" : "px-3")}>
      <div className="flex items-center gap-1">
        <Brand rail={rail} onNavigate={onNavigate} />
        {onToggle && !rail && <CollapseToggle rail={false} onToggle={onToggle} />}
      </div>
      <SearchButton rail={rail} onNavigate={onNavigate} />
      <div className={cn("scroll-thin -mx-1 min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-1 pt-2", rail && "w-full")}>
        <Suspense fallback={<NavLinks pathname="" rail={rail} onNavigate={onNavigate} />}>
          <ActiveNav rail={rail} onNavigate={onNavigate} />
        </Suspense>
      </div>
      {onToggle && rail && <CollapseToggle rail onToggle={onToggle} />}
      <OperatorMenu rail={rail} />
    </div>
  );
}

/** The desktop column; it folds to an icon rail and remembers that. */
export function Sidebar() {
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  return (
    <aside
      data-slot="sidebar-rail"
      className="hidden w-64 shrink-0 overflow-hidden transition-[width] duration-200 ease-out lg:block rail:w-16"
    >
      <SidebarContent rail={collapsed} onToggle={() => setCollapsed(!collapsed)} />
    </aside>
  );
}
