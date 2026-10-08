import { Activity, BookOpen, Boxes, KeyRound, LayoutDashboard, Rocket, Wallet, type LucideIcon } from "lucide-react";
import { site } from "@/config/site";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  external?: boolean;
  trailing?: "balance";
}

export const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/models", label: "Model library", icon: Boxes },
      { href: "/quickstart", label: "Quickstart", icon: Rocket },
    ],
  },
  {
    label: "Build",
    items: [
      { href: "/api-keys", label: "API keys", icon: KeyRound },
      { href: "/usage", label: "Usage & logs", icon: Activity },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/billing", label: "Billing", icon: Wallet, trailing: "balance" },
      { href: site.docsUrl, label: "Documentation", icon: BookOpen, external: true },
    ],
  },
];

export const flatNav = navGroups.flatMap((g) => g.items);
