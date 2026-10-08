import { site } from "@/config/site";
import { hash, seeded } from "@/lib/random";
import type { Endpoint, Model, ModelStats, Region, Status } from "@/types/model";

const edgeLocations: [Region, string][] = [
  ["eu", "Frankfurt"],
  ["eu", "Dublin"],
  ["us", "Virginia"],
  ["us", "Oregon"],
  ["apac", "Tokyo"],
  ["sa", "São Paulo"],
];

const releaseDates: Record<string, string> = {
  "lumen-1": "Oct 1, 2026",
  "kling-3": "Aug 19, 2026",
  "veo-3-1": "Jul 8, 2026",
  "seedance-2-5": "Sep 2, 2026",
  "hailuo-03": "Jun 24, 2026",
  "flux-2-pro": "Sep 23, 2026",
  "nano-banana-pro": "Aug 5, 2026",
  "seedream-4-5": "Sep 9, 2026",
  "eleven-v3": "May 27, 2026",
  "lyria-2": "Apr 15, 2026",
  "hunyuan3d-3": "Sep 30, 2026",
  "wan-2-6": "Jul 29, 2026",
};

const days = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 9, 7) - (29 - i) * 864e5);
  return {
    label: d.toLocaleDateString("en-US", { month: "short", day: "2-digit", timeZone: "UTC" }),
    date: `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })} UTC`,
  };
});

/** Sample routing, latency and uptime data, seeded per model so every render matches. */
export function statsFor(model: Model): ModelStats {
  const rand = seeded(hash(model.slug));
  const baseLatency = Number(model.latency.replace(/\D/g, ""));
  const original = model.tags?.includes("original");

  const hosts: Pick<Endpoint, "host" | "kind" | "region" | "location">[] = [
    { host: original ? site.name : model.provider, kind: "direct", region: "global", location: original ? "Anycast" : "First-party API" },
    ...edgeLocations.map(([region, location]) => ({ host: `${site.name} Edge`, kind: "edge" as const, region, location })),
    { host: `${site.name} Spot`, kind: "spot", region: "global", location: "Preemptible pool" },
  ];

  const endpoints: Endpoint[] = hosts.map((h, i) => {
    const discount = h.kind === "spot" ? 0.4 : h.kind === "direct" ? (model.promo ?? 0) : rand() < 0.35 ? [0.1, 0.15, 0.2][i % 3] : 0;
    const markup = h.kind === "edge" ? 1 + Math.round(rand() * 4) * 0.05 : 1;
    const listPrice = +(model.price * markup).toFixed(4);
    const p50 = +(baseLatency * (h.kind === "spot" ? 1.35 : 0.8 + rand() * 0.4)).toFixed(1);
    const uptime = h.kind === "spot" ? 91 + rand() * 6 : rand() < 0.15 ? 96 + rand() * 3 : 99.2 + rand() * 0.79;
    return {
      id: `${h.host}-${h.location}`.toLowerCase().replace(/\W+/g, "-"),
      ...h,
      listPrice,
      price: +(listPrice * (1 - discount)).toFixed(4),
      draftPrice: rand() < 0.55 ? +(listPrice * 0.35).toFixed(4) : null,
      latency: { p50, p90: +(p50 * (1.3 + rand() * 0.3)).toFixed(1), p99: +(p50 * (1.9 + rand() * 0.8)).toFixed(1) },
      throughput: Math.round((h.kind === "spot" ? 120 : 20) + rand() * 60),
      uptime: +uptime.toFixed(2),
      recent: Array.from({ length: 6 }, () => Math.min(100, uptime + (rand() - 0.6) * (100 - uptime) * 3)),
      history: Array.from({ length: 45 }, (): Status => {
        const r = rand() * 100;
        return r < (100 - uptime) * 1.5 ? "down" : r < (100 - uptime) * 6 ? "degraded" : "ok";
      }),
    };
  });

  const latency = days.map((d) => ({ ...d, value: +(baseLatency * (0.8 + rand() * 0.45)).toFixed(1) }));
  const uptime = Array.from({ length: 45 }, (_, day): Status => {
    const states = endpoints.filter((e) => e.kind !== "spot").map((e) => e.history[day]);
    const down = states.filter((s) => s === "down").length;
    const degraded = states.filter((s) => s === "degraded").length;
    return down >= 2 ? "down" : down === 1 || degraded >= 2 ? "degraded" : "ok";
  });
  const routed = endpoints.filter((e) => e.kind !== "spot");
  const effective = endpoints.reduce((s, e) => s + e.price, 0) / endpoints.length;

  return {
    released: releaseDates[model.slug] ?? "2026",
    endpoints,
    latency,
    uptime,
    uptimePct: Math.max(...routed.map((e) => e.uptime)),
    effective,
  };
}
