import { modalityOrder } from "@/lib/modality";
import { modelId } from "@/lib/model";
import { costOf } from "@/lib/pricing";
import { seeded } from "@/lib/random";
import type { Modality } from "@/types/model";
import type { DailyUsage, RequestLog } from "@/types/usage";
import { sampleNow } from "./clock";
import { findModels, models } from "./models";

const base: Record<Modality, number> = { video: 14, image: 4.2, audio: 1.6, "3d": 0.9 };

/** Relative popularity inside each modality; unlisted models get 1. */
const modelWeight: Record<string, number> = {
  "lumen-1": 3.2,
  "kling-3": 2.2,
  "seedance-2.5": 1.8,
  "veo-3.1": 1.5,
  "hailuo-03": 0.7,
  "wan-2.6": 0.5,
  "flux-2-pro": 2.4,
  "nano-banana-pro": 2,
  "seedream-4.5": 1,
  "eleven-v3": 2.6,
  "lyria-2": 1,
};
const anchor = sampleNow;
const monthFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", timeZone: "UTC" });
const fullFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Share of requests per modality, used to split daily request counts. */
export const requestShare: Record<Modality, number> = { video: 0.34, image: 0.42, audio: 0.19, "3d": 0.05 };

/** Splits each modality's daily spend and requests across its models; parts add up exactly. */
function splitByModel(spend: Record<Modality, number>, requests: number, rand: () => number) {
  const split: DailyUsage["models"] = {};
  for (const m of modalityOrder) {
    const group = models.filter((model) => model.modality === m);
    const weights = group.map((model) => (modelWeight[model.slug] ?? 1) * (0.75 + rand() * 0.5));
    const total = weights.reduce((s, w) => s + w, 0);
    // Cheaper models take a larger share of requests than of spend.
    const reqWeights = group.map((model, i) => weights[i] / model.price);
    const reqTotal = reqWeights.reduce((s, w) => s + w, 0);
    const modalityRequests = Math.round(requests * requestShare[m]);
    let spendLeft = spend[m];
    let requestsLeft = modalityRequests;
    group.forEach((model, i) => {
      const last = i === group.length - 1;
      const s = last ? spendLeft : +((spend[m] * weights[i]) / total).toFixed(2);
      const r = last ? requestsLeft : Math.round((modalityRequests * reqWeights[i]) / reqTotal);
      spendLeft = +(spendLeft - s).toFixed(2);
      requestsLeft -= r;
      split[model.slug] = { spend: Math.max(0, s), requests: Math.max(0, r) };
    });
  }
  return split;
}

function buildSeries(days: number): DailyUsage[] {
  const rand = seeded(42);
  const splitRand = seeded(7);
  return Array.from({ length: days }, (_, i) => {
    const growth = 0.55 + (i / days) * 0.9;
    const weekday = new Date(anchor - (days - 1 - i) * 864e5).getUTCDay();
    const weekend = weekday === 0 || weekday === 6 ? 0.62 : 1;
    const spend = Object.fromEntries(
      modalityOrder.map((m) => [m, +(base[m] * growth * weekend * (0.7 + rand() * 0.6)).toFixed(2)]),
    ) as Record<Modality, number>;
    const requests = Math.round((280 + rand() * 160) * growth * weekend);
    const at = anchor - (days - 1 - i) * 864e5;
    return {
      day: new Date(at).toISOString().slice(0, 10),
      label: monthFmt.format(at),
      date: `${fullFmt.format(at)} UTC`,
      spend,
      models: splitByModel(spend, requests, splitRand),
      requests,
      errors: Math.round(requests * (0.004 + rand() * 0.012)),
      p50: Math.round(1800 + rand() * 900),
    };
  });
}

export const usageSeries = buildSeries(90);

export const monthlyBudget = 500;

export function totalSpend(day: DailyUsage) {
  return modalityOrder.reduce((sum, m) => sum + day.spend[m], 0);
}

const monthName = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" });

/** The days of the latest month in `series` (month to date) and that month's name. */
export function monthToDate(series: DailyUsage[] = usageSeries) {
  const last = series.at(-1);
  if (!last) return { month: "", days: [] };
  const month = last.day.slice(0, 7);
  return { month: monthName.format(Date.parse(last.day)), days: series.filter((d) => d.day.startsWith(month)) };
}

export const recentRequests: RequestLog[] = (() => {
  const rand = seeded(19);
  const slugs = ["lumen-1", "flux-2-pro", "kling-3", "eleven-v3", "nano-banana-pro", "seedance-2.5"];
  return findModels(slugs).map((model, i) => {
    const failed = i === 3;
    const units = model.modality === "video" ? Math.round(5 + rand() * 10) : 1;
    return {
      id: `task_${(0x9f2a3 + i * 7919).toString(36)}${(0x51c + i * 131).toString(36)}`,
      model: modelId(model),
      endpoint: "POST /v1/tasks",
      status: failed ? 402 : model.modality === "video" ? 202 : 200,
      duration: failed ? 0.4 : +(2 + rand() * 50).toFixed(1),
      cost: failed ? 0 : costOf(model, units),
      ago: `${2 + i * 7}m ago`,
    };
  });
})();
