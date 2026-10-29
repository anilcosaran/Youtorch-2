import { Activity, Code2, Gauge, Server, Sparkles, Tag } from "lucide-react";

export const modelTabs = [
  { id: "playground", label: "Playground", icon: Sparkles },
  { id: "providers", label: "Providers", icon: Server },
  { id: "pricing", label: "Pricing", icon: Tag },
  { id: "performance", label: "Performance", icon: Gauge },
  { id: "uptime", label: "Uptime", icon: Activity },
  { id: "api", label: "API", icon: Code2 },
] as const;

export type ModelTab = (typeof modelTabs)[number];

export type ModelTabId = ModelTab["id"];

export const defaultTab: ModelTabId = "playground";

export function isModelTab(value: string | null): value is ModelTabId {
  return modelTabs.some((t) => t.id === value);
}

export const tabId = (id: ModelTabId) => `tab-${id}`;
export const panelId = (id: ModelTabId) => `panel-${id}`;
