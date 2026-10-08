import { Activity, Code2, Gauge, Server, Tag } from "lucide-react";

export const detailSections = [
  { id: "providers", label: "Providers", icon: Server },
  { id: "pricing", label: "Pricing", icon: Tag },
  { id: "performance", label: "Performance", icon: Gauge },
  { id: "uptime", label: "Uptime", icon: Activity },
  { id: "api", label: "API", icon: Code2 },
] as const;

export type DetailSectionId = (typeof detailSections)[number]["id"];
