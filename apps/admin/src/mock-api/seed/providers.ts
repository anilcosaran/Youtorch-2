import type { ProviderRecord } from "../types";
import { DAY, HOUR, MINUTE, iso } from "../util";

type ProviderSeed = Omit<ProviderRecord, "createdAt" | "updatedAt" | "cost30dMicros" | "credential" | "health"> & {
  ageDays: number;
  hint: string | null;
  health: Omit<ProviderRecord["health"], "checkedAt"> & { checked: boolean };
};

const SEEDS: ProviderSeed[] = [
  {
    id: "google",
    name: "Google",
    kind: "first_party",
    adapter: "google",
    status: "active",
    baseUrl: "https://us-central1-aiplatform.googleapis.com/v1",
    regions: ["us-central1", "europe-west4"],
    whiteLabelAllowed: false,
    licenseNotes: "",
    ageDays: 330,
    hint: "…9f3c",
    limits: { concurrency: 300, requestsPerMinute: 4000 },
    health: { state: "operational", successRate24h: 0.993, p50Ms: 11600, checked: true },
  },
  {
    id: "openai",
    name: "OpenAI",
    kind: "first_party",
    adapter: "openai",
    status: "active",
    baseUrl: "https://api.openai.com/v1",
    regions: ["us"],
    whiteLabelAllowed: true,
    licenseNotes: "Our enterprise terms allow resale under our own name.",
    ageDays: 300,
    hint: "…Qx8d",
    limits: { concurrency: 150, requestsPerMinute: 5000 },
    health: { state: "degraded", successRate24h: 0.781, p50Ms: 71000, checked: true },
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    kind: "first_party",
    adapter: "elevenlabs",
    status: "active",
    baseUrl: "https://api.elevenlabs.io/v1",
    regions: ["us", "eu"],
    whiteLabelAllowed: false,
    licenseNotes: "",
    ageDays: 280,
    hint: "…e2b7",
    limits: { concurrency: 100, requestsPerMinute: 3000 },
    health: { state: "operational", successRate24h: 0.996, p50Ms: 2100, checked: true },
  },
  {
    id: "kling",
    name: "Kling AI",
    kind: "first_party",
    adapter: "kling",
    status: "active",
    baseUrl: "https://api-singapore.klingai.com/v1",
    regions: ["ap-southeast-1", "us-west-2"],
    whiteLabelAllowed: false,
    licenseNotes: "",
    ageDays: 215,
    hint: "…k3v9",
    limits: { concurrency: 200, requestsPerMinute: 1000 },
    health: { state: "operational", successRate24h: 0.984, p50Ms: 52000, checked: true },
  },
  {
    id: "dev-fake",
    name: "Fake provider",
    kind: "managed",
    adapter: "fake",
    status: "disabled",
    baseUrl: "https://fake.internal.modelvend.ai",
    regions: ["local"],
    whiteLabelAllowed: true,
    licenseNotes: "Answers from canned output, for trying the platform without spending anything.",
    ageDays: 20,
    hint: null,
    limits: { concurrency: null, requestsPerMinute: null },
    health: { state: "operational", successRate24h: null, p50Ms: null, checked: false },
  },
];

/** Providers; `cost30dMicros` is filled in once the catalog exists (see seed/index.ts). */
export function seedProviders(now: number): ProviderRecord[] {
  return SEEDS.map(({ ageDays, hint, health, ...seed }) => ({
    ...seed,
    credential: { configured: hint !== null, hint },
    health: {
      state: health.state,
      successRate24h: health.successRate24h,
      p50Ms: health.p50Ms,
      checkedAt: health.checked ? iso(now - 4 * MINUTE) : null,
    },
    cost30dMicros: 0,
    createdAt: iso(now - ageDays * DAY),
    updatedAt: iso(now - Math.min(ageDays, 3) * DAY - 5 * HOUR),
  }));
}
