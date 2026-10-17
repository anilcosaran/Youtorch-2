import type { Region, Status } from "@/types/model";

export const regionLabel: Record<Region, string> = {
  global: "GL",
  eu: "EU",
  us: "US",
  apac: "AP",
  sa: "SA",
};

export const regionOptions: { value: "all" | Exclude<Region, "global">; label: string }[] = [
  { value: "all", label: "All regions" },
  { value: "eu", label: "Europe" },
  { value: "us", label: "North America" },
  { value: "apac", label: "Asia Pacific" },
  { value: "sa", label: "South America" },
];

export const statusTone: Record<Status, string> = {
  ok: "bg-ok",
  degraded: "bg-warn",
  down: "bg-down",
};

export function uptimeTone(percent: number) {
  return percent >= 99 ? "bg-ok" : percent >= 95 ? "bg-warn" : "bg-down";
}
