import {
  Activity,
  AppWindow,
  Boxes,
  History,
  KeyRound,
  LayoutDashboard,
  UserCog,
  UsersRound,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@modelvend/admin-api/auth";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Other words the command palette finds the page by. */
  keywords?: string;
  /** Shown only to operators with this permission; the page itself checks it too. */
  requires?: Permission;
  /** Shows how many providers are degraded or down. */
  badge?: "providers";
  /** Colours the icon (and its badge) so the item stands out; every other icon stays monochrome. */
  tone?: "warning";
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

/** Ordered by how often operators open each page. */
export const NAV: NavGroup[] = [
  {
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard, keywords: "home dashboard revenue margin" },
      {
        href: "/tasks",
        label: "Tasks",
        icon: Activity,
        keywords: "generations logs runs jobs errors failed queue",
        requires: "tasks.view",
      },
    ],
  },
  {
    label: "Catalog",
    items: [
      {
        href: "/models",
        label: "Models",
        icon: Boxes,
        keywords: "catalog versions deploy deprecate pause pricing schema routes endpoints",
        requires: "catalog.view",
      },
      {
        href: "/apps",
        label: "Apps",
        icon: AppWindow,
        keywords: "workflows releases deploy rollback",
        requires: "catalog.view",
      },
      {
        href: "/providers",
        label: "Providers",
        icon: Waypoints,
        keywords: "upstream google openai elevenlabs kling routing credentials health",
        requires: "providers.view",
        badge: "providers",
        tone: "warning",
      },
    ],
  },
  {
    label: "Customers",
    items: [
      {
        href: "/customers",
        label: "Customers",
        icon: UsersRound,
        keywords: "users workspaces accounts credits balance limits suspend",
        requires: "customers.view",
      },
      {
        href: "/api-keys",
        label: "API keys",
        icon: KeyRound,
        keywords: "tokens secrets revoke",
        requires: "keys.view",
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        href: "/audit",
        label: "Audit log",
        icon: History,
        keywords: "history changes",
        requires: "audit.view",
      },
      {
        href: "/operators",
        label: "Operators",
        icon: UserCog,
        keywords: "team staff permissions access",
        requires: "operators.manage",
      },
    ],
  },
];

/** The groups with only the items the operator may open. */
export function visibleNav(allows: (permission: Permission) => boolean): NavGroup[] {
  return NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.requires || allows(item.requires)),
  })).filter((group) => group.items.length > 0);
}

/** The nav item a page belongs to, by its top-level path. */
export function navItem(href: string): NavItem | undefined {
  return NAV.flatMap((group) => group.items).find((item) => item.href === href);
}

export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
