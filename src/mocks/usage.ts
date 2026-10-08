import { modalityOrder } from "@/lib/modality";
import { seeded } from "@/lib/random";
import type { Modality } from "@/types/model";
import type { DailyUsage, RequestLog } from "@/types/usage";

const base: Record<Modality, number> = { video: 14, image: 4.2, audio: 1.6, "3d": 0.9 };
const anchor = Date.UTC(2026, 9, 7);
const monthFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", timeZone: "UTC" });
const fullFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function buildSeries(days: number): DailyUsage[] {
  const rand = seeded(42);
  return Array.from({ length: days }, (_, i) => {
    const growth = 0.55 + (i / days) * 0.9;
    const weekday = new Date(anchor - (days - 1 - i) * 864e5).getUTCDay();
    const weekend = weekday === 0 || weekday === 6 ? 0.62 : 1;
    const spend = Object.fromEntries(
      modalityOrder.map((m) => [m, +(base[m] * growth * weekend * (0.7 + rand() * 0.6)).toFixed(2)]),
    ) as Record<Modality, number>;
    const requests = Math.round((280 + rand() * 160) * growth * weekend);
    return {
      label: monthFmt.format(anchor - (days - 1 - i) * 864e5),
      date: `${fullFmt.format(anchor - (days - 1 - i) * 864e5)} UTC`,
      spend,
      requests,
      errors: Math.round(requests * (0.004 + rand() * 0.012)),
      p50: Math.round(1800 + rand() * 900),
    };
  });
}

export const usageSeries = buildSeries(90);

/** Share of requests per modality, used to split daily request counts. */
export const requestShare: Record<Modality, number> = { video: 0.34, image: 0.42, audio: 0.19, "3d": 0.05 };

export const monthlyBudget = 500;

export function totalSpend(day: DailyUsage) {
  return modalityOrder.reduce((sum, m) => sum + day.spend[m], 0);
}

export const recentRequests: RequestLog[] = (() => {
  const rand = seeded(19);
  const entries: [string, string, number][] = [
    ["lumen-1", "/v1/video/generations", 0.152],
    ["flux-2-pro", "/v1/images/generations", 0.045],
    ["kling-3", "/v1/video/generations", 0.084],
    ["eleven-v3", "/v1/audio/speech", 0.18],
    ["nano-banana-pro", "/v1/images/edits", 0.039],
    ["seedance-2-5", "/v1/video/generations", 0.206],
  ];
  return entries.map(([model, endpoint, unit], i) => {
    const failed = i === 3;
    const seconds = model.includes("pro") || model.includes("v3") ? 1 : Math.round(5 + rand() * 10);
    return {
      id: `req_${(0x9f2a3 + i * 7919).toString(36)}${(0x51c + i * 131).toString(36)}`,
      model,
      endpoint,
      status: failed ? 429 : 200,
      duration: failed ? 0.4 : +(2 + rand() * 50).toFixed(1),
      cost: failed ? 0 : +(unit * seconds).toFixed(3),
      ago: `${2 + i * 7}m ago`,
    };
  });
})();
