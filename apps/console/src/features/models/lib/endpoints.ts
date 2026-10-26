import type { Status } from "@/types/model";

export const statusTone: Record<Status, string> = {
  ok: "bg-ok",
  degraded: "bg-warn",
  down: "bg-down",
};

export function uptimeTone(percent: number) {
  return percent >= 99 ? "bg-ok" : percent >= 95 ? "bg-warn" : "bg-down";
}
