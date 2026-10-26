import { hash, seeded } from "@/lib/random";
import type { Model, ModelProvider, ModelStats, Status } from "@/types/model";
import { sampleNow } from "./clock";

type ProviderRef = Pick<ModelProvider, "id" | "name" | "region">;

const fal: ProviderRef = { id: "fal", name: "fal", region: "us" };
const replicate: ProviderRef = { id: "replicate", name: "Replicate", region: "us" };
const vertex: ProviderRef = { id: "google-vertex", name: "Google Vertex AI", region: "us-central1" };
const byteplus: ProviderRef = { id: "byteplus", name: "BytePlus ModelArk", region: "ap-southeast-1" };

/**
 * Providers serving each open model's default version, as routed in the admin catalog. White-label models are
 * absent on purpose: their providers are never shown.
 */
const providersBySlug: Record<string, ProviderRef[]> = {
  "kling-3": [{ id: "kling", name: "Kling AI", region: "ap-southeast-1" }, fal],
  "veo-3.1": [vertex, fal],
  "seedance-2.5": [byteplus, fal, replicate],
  "hailuo-03": [{ id: "minimax", name: "MiniMax", region: "global" }, fal],
  "flux-2-pro": [replicate, fal],
  "nano-banana-pro": [vertex, fal],
  "seedream-4.5": [byteplus, fal],
  "eleven-v3": [{ id: "elevenlabs", name: "ElevenLabs", region: "us" }],
  "lyria-2": [vertex],
  "hunyuan3d-3": [fal, replicate],
  "wan-2.6": [fal, replicate],
};

const releaseDates: Record<string, string> = {
  "lumen-1": "Oct 1, 2026",
  "kling-3": "Aug 19, 2026",
  "veo-3.1": "Jul 8, 2026",
  "seedance-2.5": "Sep 2, 2026",
  "hailuo-03": "Jun 24, 2026",
  "flux-2-pro": "Sep 23, 2026",
  "nano-banana-pro": "Aug 5, 2026",
  "seedream-4.5": "Sep 9, 2026",
  "eleven-v3": "May 27, 2026",
  "lyria-2": "Apr 15, 2026",
  "hunyuan3d-3": "Sep 30, 2026",
  "wan-2.6": "Jul 29, 2026",
};

const shortFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", timeZone: "UTC" });
const fullFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

const days = Array.from({ length: 30 }, (_, i) => {
  const d = sampleNow - (29 - i) * 864e5;
  return { label: shortFmt.format(d), date: `${fullFmt.format(d)} UTC` };
});

/** 45 days of daily status for a service with the given uptime, newest last. */
function statusHistory(uptime: number, rand: () => number) {
  return Array.from({ length: 45 }, (): Status => {
    const r = rand() * 100;
    return r < (100 - uptime) * 1.5 ? "down" : r < (100 - uptime) * 6 ? "degraded" : "ok";
  });
}

/** Sample latency and uptime, seeded per model so every render matches. */
export function statsFor(model: Model): ModelStats {
  const rand = seeded(hash(model.slug));
  const baseLatency = Number(model.latency.replace(/\D/g, ""));
  const uptimePct = rand() < 0.15 ? 98.5 + rand() * 1 : 99.5 + rand() * 0.49;

  const providers: ModelProvider[] =
    model.disclosure === "open"
      ? (providersBySlug[model.slug] ?? []).map((p) => {
          const p50 = +(baseLatency * (0.8 + rand() * 0.4)).toFixed(1);
          const uptime = rand() < 0.15 ? 96 + rand() * 3 : 99.2 + rand() * 0.79;
          return {
            ...p,
            latency: { p50, p90: +(p50 * (1.3 + rand() * 0.3)).toFixed(1), p99: +(p50 * (1.9 + rand() * 0.8)).toFixed(1) },
            uptime: +uptime.toFixed(2),
            recent: Array.from({ length: 6 }, () => Math.min(100, uptime + (rand() - 0.6) * (100 - uptime) * 3)),
            history: statusHistory(uptime, rand),
          };
        })
      : [];

  return {
    released: releaseDates[model.slug] ?? "2026",
    providers,
    latency: days.map((d) => ({ ...d, value: +(baseLatency * (0.8 + rand() * 0.45)).toFixed(1) })),
    uptime: statusHistory(uptimePct, rand),
    uptimePct: +uptimePct.toFixed(2),
  };
}
