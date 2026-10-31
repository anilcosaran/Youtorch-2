import type {
  BillingUnit,
  InputPrice,
  JsonSchema,
  Medium,
  Modality,
  ModelVersion,
  Pricing,
  Route,
  RouteStatus,
  RoutingPolicy,
  TierCosts,
  VersionStatus,
  Visibility,
} from "@modelvend/admin-api/models";
import { TYPICAL_UNITS, defaultRouting, defaultTier, withTierCosts } from "../catalog";
import type { Random } from "../random";
import type { ModelRecord, ProviderRecord } from "../types";
import { DAY, HOUR, MINUTE, decimal, iso, micros, round, sum } from "../util";
import {
  audioOutput,
  imageInput,
  imageOutput,
  musicInput,
  promptInput,
  promptOutput,
  speechInput,
  videoInput,
  videoOutput,
} from "./schemas";

interface RouteSeed {
  provider: string;
  upstream: string;
  /** Per unit at the default tier. */
  cost: number;
  status?: RouteStatus;
  weight?: number;
  /** Defaults to the provider's first region. */
  region?: string;
  successRate?: number;
  maxConcurrency?: number;
  /** Days since the route last changed, when it changed after the version was made. */
  changed?: number;
}

interface VersionSeed {
  id: string;
  label: string;
  status: VersionStatus;
  isDefault?: boolean;
  changelog: string;
  /** Days ago. */
  created: number;
  released?: number;
  deprecated?: number;
  /** Days from now; negative once passed. */
  sunset?: number;
  replacement?: string;
  /** Share of the model's last 24 hours of traffic. */
  share: number;
  input: JsonSchema;
  routes: RouteSeed[];
  routing?: Partial<RoutingPolicy>;
  by: string;
}

interface ModelSeed {
  publisher: string;
  slug: string;
  name: string;
  modality: Modality;
  tasks: string[];
  description: string;
  inputs: Medium[];
  outputs: Medium[];
  tags: string[];
  license: string | null;
  visibility: Visibility;
  featured?: boolean;
  paused?: { reason: string; daysAgo: number };
  created: number;
  tasks24h: number;
  errorRate24h: number;
  /** p50 latency range in milliseconds. */
  latency: [number, number];
  unit: BillingUnit;
  /** [id, label, price]; the default tier is `defaultTier`. */
  tiers: [string, string, number][];
  defaultTier: string;
  inputPrice?: InputPrice;
  promo?: number;
  output: JsonSchema;
  versions: VersionSeed[];
}

const MARA = "Mara Lindqvist";
const ANIL = "Anıl Coşaran";

const AUTHORS: Record<string, string> = {
  elevenlabs: "ElevenLabs",
  google: "Google DeepMind",
  kling: "Kuaishou",
  modelvend: "OpenAI",
  openai: "OpenAI",
};

const MODELS: ModelSeed[] = [
  {
    publisher: "kling",
    slug: "kling-3",
    name: "Kling 3.0",
    modality: "video",
    tasks: ["text-to-video", "image-to-video", "multi-shot"],
    description: "Multi-shot sequences from text or images with synced audio and durations up to 15 seconds.",
    inputs: ["text", "image"],
    outputs: ["video", "audio"],
    tags: ["trending"],
    license: "Kling AI API terms",
    visibility: "public",
    created: 210,
    tasks24h: 6800,
    errorRate24h: 0.014,
    latency: [48000, 56000],
    unit: "second",
    tiers: [
      ["720p", "720p", 0.056],
      ["1080p", "1080p", 0.084],
    ],
    defaultTier: "1080p",
    promo: 0.2,
    output: videoOutput,
    versions: [
      {
        id: "v1",
        label: "3.0 preview",
        status: "retired",
        changelog: "Preview access to Kling 3.0.",
        created: 210,
        released: 205,
        deprecated: 120,
        sunset: -60,
        replacement: "v3",
        share: 0,
        input: videoInput({ durations: [5, 10], resolutions: ["720p", "1080p"] }),
        routes: [{ provider: "kling", upstream: "kling-v3-preview", cost: 0.06, status: "paused", changed: 60 }],
        by: MARA,
      },
      {
        id: "v2",
        label: "3.0",
        status: "deprecated",
        changelog: "General availability. 5 and 10 s clips with synced audio.",
        created: 130,
        released: 125,
        deprecated: 14,
        sunset: 30,
        replacement: "v3",
        share: 0.12,
        input: videoInput({ durations: [5, 10], resolutions: ["720p", "1080p"], audio: true }),
        routes: [
          { provider: "kling", upstream: "kling-v3-0", cost: 0.056 },
        ],
        by: MARA,
      },
      {
        id: "v3",
        label: "3.1",
        status: "live",
        isDefault: true,
        changelog: "Multi-shot sequences up to 15 s; better lip-sync.",
        created: 30,
        released: 15,
        share: 0.88,
        input: videoInput({ durations: [5, 10, 15], resolutions: ["720p", "1080p"], audio: true }),
        routes: [
          { provider: "kling", upstream: "kling-v3-1", cost: 0.056, maxConcurrency: 200 },
          { provider: "kling", upstream: "kling-v3-1", cost: 0.06, region: "us-west-2", maxConcurrency: 60 },
        ],
        by: MARA,
      },
    ],
  },
  {
    publisher: "google",
    slug: "veo-3.1",
    name: "Veo 3.1",
    modality: "video",
    tasks: ["text-to-video", "image-to-video"],
    description: "High-fidelity 1080p video with dialogue, sound effects and strong prompt adherence.",
    inputs: ["text", "image"],
    outputs: ["video", "audio"],
    tags: ["audio"],
    license: "Google Cloud generative AI terms",
    visibility: "public",
    featured: true,
    created: 75,
    tasks24h: 4100,
    errorRate24h: 0.009,
    latency: [60000, 70000],
    unit: "second",
    tiers: [
      ["1080p-silent", "1080p, no audio", 0.15],
      ["1080p", "1080p", 0.25],
    ],
    defaultTier: "1080p",
    output: videoOutput,
    versions: [
      {
        id: "v1",
        label: "3.1 preview",
        status: "deprecated",
        changelog: "Preview of Veo 3.1 on Vertex AI.",
        created: 75,
        released: 74,
        deprecated: 10,
        sunset: 20,
        replacement: "v2",
        share: 0.1,
        input: videoInput({ durations: [4, 6, 8], resolutions: ["720p", "1080p"], aspectRatios: ["16:9", "9:16"], audio: true }),
        routes: [{ provider: "google", upstream: "google/veo-3.1-generate-preview", cost: 0.2 }],
        by: MARA,
      },
      {
        id: "v2",
        label: "3.1",
        status: "live",
        isDefault: true,
        changelog: "General availability on Vertex AI, with a second region as a fallback.",
        created: 12,
        released: 10,
        share: 0.9,
        input: videoInput({ durations: [4, 6, 8], resolutions: ["720p", "1080p"], aspectRatios: ["16:9", "9:16"], audio: true, lastFrame: true }),
        routes: [
          { provider: "google", upstream: "google/veo-3.1-generate-001", cost: 0.2, maxConcurrency: 120 },
        ],
        by: MARA,
      },
    ],
  },
  {
    publisher: "google",
    slug: "nano-banana-pro",
    name: "Nano Banana Pro",
    modality: "image",
    tasks: ["text-to-image", "image-editing", "inpainting"],
    description: "Conversational image editing with world knowledge, legible text and character consistency.",
    inputs: ["text", "image"],
    outputs: ["text", "image"],
    tags: ["trending"],
    license: "Google Cloud generative AI terms",
    visibility: "public",
    featured: true,
    created: 100,
    tasks24h: 14200,
    errorRate24h: 0.007,
    latency: [8000, 10000],
    unit: "image",
    tiers: [
      ["1k", "1024×1024", 0.039],
      ["2k", "2048×2048", 0.078],
      ["4k", "4096×4096", 0.156],
    ],
    defaultTier: "1k",
    inputPrice: { unit: "image", price: "0.002", field: "reference_image_urls" },
    promo: 0.25,
    output: imageOutput,
    versions: [
      {
        id: "2026-06-12",
        label: "Jun 2026",
        status: "deprecated",
        changelog: "Preview on Vertex AI.",
        created: 100,
        released: 98,
        deprecated: 18,
        sunset: 12,
        replacement: "2026-09-30",
        share: 0.07,
        input: imageInput({ sizes: ["1024x1024", "2048x2048"], maxImages: 4, references: 6, edit: true }),
        routes: [{ provider: "google", upstream: "gemini-3-pro-image-preview", cost: 0.036 }],
        by: MARA,
      },
      {
        id: "2026-09-30",
        label: "Sep 2026",
        status: "live",
        isDefault: true,
        changelog: "General availability: 4K output and up to 14 reference images.",
        created: 16,
        released: 15,
        share: 0.93,
        input: imageInput({ sizes: ["1024x1024", "2048x2048", "4096x4096"], maxImages: 4, references: 14, edit: true }),
        routes: [
          { provider: "google", upstream: "gemini-3-pro-image", cost: 0.036, maxConcurrency: 300 },
        ],
        by: MARA,
      },
    ],
  },
  {
    publisher: "elevenlabs",
    slug: "eleven-v3",
    name: "Eleven v3",
    modality: "audio",
    tasks: ["text-to-speech", "dialogue"],
    description: "Expressive multilingual speech with emotion tags, dialogue mode and 70+ languages.",
    inputs: ["text"],
    outputs: ["audio"],
    tags: ["multilingual"],
    license: "ElevenLabs API terms",
    visibility: "public",
    created: 180,
    tasks24h: 5600,
    errorRate24h: 0.004,
    latency: [1500, 2600],
    unit: "1k_chars",
    tiers: [
      ["turbo", "Turbo", 0.09],
      ["expressive", "Expressive", 0.18],
    ],
    defaultTier: "expressive",
    output: audioOutput,
    versions: [
      {
        id: "v1",
        label: "v3 alpha",
        status: "retired",
        changelog: "Alpha access.",
        created: 180,
        released: 178,
        deprecated: 90,
        sunset: -30,
        replacement: "v2",
        share: 0,
        input: speechInput({ expressive: false }),
        routes: [{ provider: "elevenlabs", upstream: "eleven_v3_alpha", cost: 0.12, status: "paused", changed: 30 }],
        by: ANIL,
      },
      {
        id: "v2",
        label: "v3",
        status: "live",
        isDefault: true,
        changelog: "General availability with audio tags and dialogue mode.",
        created: 95,
        released: 92,
        share: 1,
        input: speechInput({ expressive: true }),
        routes: [
          { provider: "elevenlabs", upstream: "eleven_v3", cost: 0.12, region: "us" },
        ],
        routing: { timeoutSeconds: 60 },
        by: ANIL,
      },
    ],
  },
  {
    publisher: "google",
    slug: "lyria-2",
    name: "Lyria 2",
    modality: "audio",
    tasks: ["text-to-music"],
    description: "Instrumental music beds at 48 kHz with tempo, key and mood steering.",
    inputs: ["text"],
    outputs: ["audio"],
    tags: ["music"],
    license: "Google Cloud generative AI terms",
    visibility: "public",
    created: 150,
    tasks24h: 900,
    errorRate24h: 0.012,
    latency: [10000, 13000],
    unit: "request",
    tiers: [
      ["stereo", "Stereo mix", 0.06],
      ["stems", "Mix + stems", 0.1],
    ],
    defaultTier: "stereo",
    output: audioOutput,
    versions: [
      {
        id: "v1",
        label: "2",
        status: "live",
        isDefault: true,
        changelog: "30 s instrumental clips at 48 kHz.",
        created: 150,
        released: 146,
        share: 1,
        input: musicInput(),
        routes: [{ provider: "google", upstream: "lyria-002", cost: 0.04 }],
        by: MARA,
      },
    ],
  },
  {
    publisher: "openai",
    slug: "gpt-image-1.5",
    name: "GPT Image 1.5",
    modality: "image",
    tasks: ["text-to-image", "image-editing"],
    description: "Instruction-following image generation and editing with strong text rendering.",
    inputs: ["text", "image"],
    outputs: ["image"],
    tags: ["editing"],
    license: "OpenAI API terms",
    visibility: "public",
    created: 35,
    tasks24h: 6100,
    errorRate24h: 0.01,
    latency: [9000, 12000],
    unit: "image",
    tiers: [
      ["low", "Low", 0.011],
      ["medium", "Medium", 0.042],
      ["high", "High", 0.167],
    ],
    defaultTier: "medium",
    output: imageOutput,
    versions: [
      {
        id: "v1",
        label: "1.5",
        status: "live",
        isDefault: true,
        changelog: "Launch release.",
        created: 35,
        released: 33,
        share: 1,
        input: imageInput({ sizes: ["1024x1024", "1536x1024", "1024x1536"], maxImages: 4, references: 10, edit: true }),
        routes: [
          { provider: "openai", upstream: "gpt-image-1.5", cost: 0.034 },
        ],
        routing: { strategy: "cheapest" },
        by: MARA,
      },
    ],
  },
  {
    publisher: "openai",
    slug: "sora-2",
    name: "Sora 2",
    modality: "video",
    tasks: ["text-to-video", "image-to-video"],
    description: "Physically grounded video with synchronized dialogue and sound.",
    inputs: ["text", "image"],
    outputs: ["video", "audio"],
    tags: ["audio"],
    license: "OpenAI API terms",
    visibility: "public",
    paused: { reason: "OpenAI is returning errors on most renders; waiting for their fix.", daysAgo: 2 },
    created: 25,
    tasks24h: 2900,
    errorRate24h: 0.021,
    latency: [70000, 90000],
    unit: "second",
    tiers: [
      ["720p", "720p", 0.14],
      ["1080p-pro", "1080p Pro", 0.6],
    ],
    defaultTier: "720p",
    output: videoOutput,
    versions: [
      {
        id: "v1",
        label: "2",
        status: "live",
        isDefault: true,
        changelog: "Launch release.",
        created: 25,
        released: 24,
        share: 1,
        input: videoInput({ durations: [4, 8, 12], resolutions: ["720p", "1080p"], aspectRatios: ["16:9", "9:16"], audio: true }),
        routes: [{ provider: "openai", upstream: "sora-2", cost: 0.1, successRate: 0.781 }],
        by: MARA,
      },
      {
        id: "v2",
        label: "2.1",
        status: "draft",
        changelog: "Longer clips.",
        created: 3,
        share: 0,
        input: videoInput({ durations: [4, 8, 12, 16], resolutions: ["720p"], aspectRatios: ["16:9", "9:16"], audio: true }),
        routes: [],
        by: MARA,
      },
    ],
  },
  {
    publisher: "modelvend",
    slug: "prompt-boost-1",
    name: "Prompt Boost 1",
    modality: "text",
    tasks: ["prompt-enhancement"],
    description: "Rewrites short prompts into detailed ones for image, video and music models. Used by apps.",
    inputs: ["text"],
    outputs: ["text"],
    tags: ["internal"],
    license: "Proprietary",
    visibility: "private",
    created: 85,
    tasks24h: 8800,
    errorRate24h: 0.002,
    latency: [900, 1500],
    unit: "1m_tokens",
    tiers: [["standard", "Standard", 0.9]],
    defaultTier: "standard",
    output: promptOutput,
    versions: [
      {
        id: "v1",
        label: "1.0",
        status: "live",
        isDefault: true,
        changelog: "First release.",
        created: 85,
        released: 84,
        share: 1,
        input: promptInput(),
        routes: [{ provider: "openai", upstream: "gpt-5-mini", cost: 0.6 }],
        routing: { maxAttempts: 1, fallbacks: false },
        by: ANIL,
      },
    ],
  },
];

/** Traffic shares for a version's routes in the last 24 hours. */
function routeShares(routes: RouteSeed[], weighted: boolean): number[] {
  const raw = routes.map((route, index) => {
    if (route.status === "paused") return 0;
    if (route.status === "draining") return 0.03;
    if (weighted) return route.weight ?? 0;
    return index === 0 ? 0.9 : 0.1 / Math.max(1, routes.length - 1);
  });
  const total = raw.reduce((a, b) => a + b, 0);
  return raw.map((share) => (total > 0 ? share / total : 0));
}

/**
 * A route's cost at each tier: the seeded cost at the default tier and, at the others, about the same share of the
 * tier's price. Providers don't scale exactly with our prices, so margins differ by tier.
 */
function tierCostsFor(model: ModelSeed, cost: number, random: Random): TierCosts {
  const base = model.tiers.find(([id]) => id === model.defaultTier)?.[2] ?? 1;
  return Object.fromEntries(
    model.tiers.map(([id, , price]) => [id, decimal(id === model.defaultTier ? cost : round((cost * price * random.float(0.92, 1.08)) / base, 4))]),
  );
}

/** Whether every resolution the version takes is a tier, so the input can pick it. */
function picksTier(model: ModelSeed, input: JsonSchema): boolean {
  const values = ((input.properties as Record<string, { enum?: unknown[] }> | undefined)?.resolution?.enum ?? []) as string[];
  return values.length > 0 && values.every((value) => model.tiers.some(([id]) => id === value));
}

function buildVersion(
  model: ModelSeed,
  seed: VersionSeed,
  now: number,
  random: Random,
  providers: ProviderRecord[],
): ModelVersion {
  const modelId = `${model.publisher}/${model.slug}`;
  const createdAt = now - seed.created * DAY - random.int(1, 9) * HOUR;
  const routing: RoutingPolicy = { ...defaultRouting(model.modality), ...seed.routing };
  const tasks24h = Math.round(model.tasks24h * seed.share);
  const shares = routeShares(seed.routes, routing.strategy === "weighted");
  const routes: Route[] = seed.routes.map((route, index) => {
    const provider = providers.find((p) => p.id === route.provider);
    const traffic = Math.round(tasks24h * shares[index]);
    const p50 = Math.round(random.float(...model.latency) * (index === 0 ? 1 : random.float(1.02, 1.2)));
    const changedAt = route.changed !== undefined ? now - route.changed * DAY - random.int(1, 6) * HOUR : createdAt + HOUR;
    return {
      id: random.id("rt_", 8),
      providerId: route.provider,
      providerName: provider?.name ?? route.provider,
      upstreamModel: route.upstream,
      status: route.status ?? "active",
      priority: index + 1,
      weight: route.weight ?? (index === 0 ? 100 : 0),
      tierCosts: tierCostsFor(model, route.cost, random),
      region: route.region ?? provider?.regions[0] ?? "us",
      maxConcurrency: route.maxConcurrency ?? null,
      mapping: null,
      transform: null,
      health:
        traffic > 0
          ? {
              successRate: round(route.successRate ?? random.float(0.975, 0.998), 4),
              p50Ms: p50,
              p95Ms: Math.round(p50 * random.float(1.6, 2.2)),
              tasks24h: traffic,
            }
          : { successRate: null, p50Ms: null, p95Ms: null, tasks24h: 0 },
      updatedAt: iso(Math.min(changedAt, now - MINUTE)),
    };
  });
  const pricing: Pricing = {
    unit: model.unit,
    defaultTier: model.defaultTier,
    tierField: picksTier(model, seed.input) ? "resolution" : null,
    tierValues: {},
    tiers: model.tiers.map(([id, label, price]) => ({ id, label, price: decimal(price), cost: null })),
    input: model.inputPrice ?? null,
    promo: model.promo ?? null,
  };
  const released = seed.released !== undefined ? now - seed.released * DAY - random.int(1, 6) * HOUR : null;
  const deprecated = seed.deprecated !== undefined ? now - seed.deprecated * DAY - random.int(1, 6) * HOUR : null;
  return {
    id: seed.id,
    modelId,
    label: seed.label,
    status: seed.status,
    isDefault: seed.isDefault ?? false,
    changelog: seed.changelog,
    inputSchema: seed.input,
    outputSchema: model.output,
    pricing: withTierCosts(pricing, routes),
    routing,
    routes,
    replacement: seed.replacement ?? null,
    createdAt: iso(createdAt),
    createdBy: seed.by,
    releasedAt: released === null ? null : iso(released),
    deprecatedAt: deprecated === null ? null : iso(deprecated),
    sunsetAt: seed.sunset !== undefined ? iso(now + seed.sunset * DAY) : null,
    tasks24h,
  };
}

/** The seeded catalog. */
export function seedCatalog(now: number, random: Random, providers: ProviderRecord[]): ModelRecord[] {
  return MODELS.map((seed) => {
    const versionList = seed.versions.map((version) => buildVersion(seed, version, now, random, providers));
    const live = versionList.find((version) => version.isDefault) ?? null;
    const typical = TYPICAL_UNITS[seed.unit];
    // What customers pay at the default tier, after the launch promo.
    const price = live ? Number(defaultTier(live.pricing).price) * (1 - (live.pricing.promo ?? 0)) : 0;
    const pausedAt = seed.paused ? now - seed.paused.daysAgo * DAY - 3 * HOUR : null;
    const changes = versionList.flatMap((v) => [v.createdAt, v.releasedAt, v.deprecatedAt]).filter((at): at is string => at !== null);
    if (pausedAt !== null) changes.push(iso(pausedAt));
    return {
      id: `${seed.publisher}/${seed.slug}`,
      publisher: seed.publisher,
      slug: seed.slug,
      name: seed.name,
      modality: seed.modality,
      tasks: seed.tasks,
      state: seed.paused ? "paused" : "active",
      visibility: seed.visibility,
      disclosure: seed.publisher === "modelvend" ? "white_label" : "open",
      featured: seed.featured ?? false,
      defaultVersion: live?.id ?? null,
      tasks24h: seed.tasks24h,
      errorRate24h: seed.errorRate24h,
      revenue30dMicros: micros(seed.tasks24h * 30 * 0.88 * typical * price * random.float(0.95, 1.05)),
      revision: 1,
      createdAt: iso(now - seed.created * DAY - 10 * HOUR),
      updatedAt: changes.sort().at(-1) ?? iso(now - seed.created * DAY),
      description: seed.description,
      inputs: seed.inputs,
      outputs: seed.outputs,
      tags: seed.tags,
      license: seed.license,
      author: AUTHORS[seed.publisher] ?? seed.publisher,
      capabilities: [],
      maxOutput: null,
      gallery: [],
      pausedReason: seed.paused?.reason ?? null,
      versionList,
    };
  });
}

/** What each provider was paid over 30 days, from its routes' traffic. */
export function providerCost30d(models: ModelRecord[], providerId: string): number {
  return micros(
    sum(models, (model) =>
      sum(model.versionList, (version) =>
        sum(
          version.routes.filter((route) => route.providerId === providerId),
          (route) => route.health.tasks24h * 30 * 0.86 * TYPICAL_UNITS[version.pricing.unit] * Number(route.tierCosts[version.pricing.defaultTier] ?? 0),
        ),
      ),
    ),
  );
}
