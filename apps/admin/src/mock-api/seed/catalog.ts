import type {
  BillingUnit,
  JsonSchema,
  Medium,
  Modality,
  ModelVersion,
  Pricing,
  Route,
  RouteStatus,
  RoutingPolicy,
  UnitPrice,
  VersionStatus,
  Visibility,
} from "@modelvend/admin-api/models";
import { TYPICAL_UNITS, defaultRouting, defaultTier, withTierCosts } from "../catalog";
import type { Random } from "../random";
import type { ModelRecord, ProviderRecord } from "../types";
import { DAY, HOUR, MINUTE, iso, money, round, sum } from "../util";
import {
  audioOutput,
  imageInput,
  imageOutput,
  meshInput,
  meshOutput,
  musicInput,
  promptInput,
  promptOutput,
  speechInput,
  upscaleInput,
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
  requests24h: number;
  errorRate24h: number;
  /** p50 latency range in milliseconds. */
  latency: [number, number];
  unit: BillingUnit;
  /** [id, label, price]; the default tier is `defaultTier`. */
  tiers: [string, string, number][];
  defaultTier: string;
  inputPrice?: UnitPrice;
  promo?: number;
  output: JsonSchema;
  versions: VersionSeed[];
}

const MARA = "Mara Lindqvist";
const ANIL = "Anıl Coşaran";

const MODELS: ModelSeed[] = [
  {
    publisher: "modelvend",
    slug: "lumen-1",
    name: "Lumen 1",
    modality: "video",
    tasks: ["text-to-video", "image-to-video"],
    description: "Our in-house cinematic model with camera control, consistent characters and native audio up to 20 s.",
    inputs: ["text", "image"],
    outputs: ["video", "audio"],
    tags: ["original", "new", "camera-control"],
    license: "Proprietary",
    visibility: "public",
    featured: true,
    created: 140,
    requests24h: 3900,
    errorRate24h: 0.011,
    latency: [34000, 42000],
    unit: "second",
    tiers: [
      ["720p", "720p", 0.112],
      ["1080p", "1080p", 0.152],
      ["4k", "4K", 0.29],
    ],
    defaultTier: "1080p",
    promo: 0.25,
    output: videoOutput,
    versions: [
      {
        id: "v1",
        label: "1.0",
        status: "deprecated",
        changelog: "First release: text and image to video, 5 or 10 s, up to 1080p.",
        created: 140,
        released: 132,
        deprecated: 20,
        sunset: 40,
        replacement: "v2",
        share: 0.08,
        input: videoInput({ durations: [5, 10], resolutions: ["720p", "1080p"] }),
        routes: [{ provider: "fal", upstream: "modelvend/lumen-1/v1", cost: 0.1, maxConcurrency: 80 }],
        by: ANIL,
      },
      {
        id: "v2",
        label: "2.0",
        status: "live",
        isDefault: true,
        changelog: "Native audio, camera paths, a 4K tier and clips up to 20 s.",
        created: 45,
        released: 21,
        share: 0.91,
        input: videoInput({ durations: [5, 10, 15, 20], resolutions: ["720p", "1080p", "4k"], aspectRatios: ["16:9", "9:16", "1:1", "21:9"], audio: true }),
        routes: [
          { provider: "fal", upstream: "modelvend/lumen-1/v2", cost: 0.098, maxConcurrency: 160 },
          { provider: "replicate", upstream: "modelvend/lumen-1-v2", cost: 0.112, maxConcurrency: 40 },
        ],
        routing: { strategy: "fastest" },
        by: ANIL,
      },
      {
        id: "v3",
        label: "2.1",
        status: "staging",
        changelog: "Character reference images and faster 720p renders.",
        created: 6,
        share: 0.01,
        input: videoInput({ durations: [5, 10, 15, 20], resolutions: ["720p", "1080p", "4k"], aspectRatios: ["16:9", "9:16", "1:1", "21:9"], audio: true }),
        routes: [{ provider: "fal", upstream: "modelvend/lumen-1/v3", cost: 0.094 }],
        by: MARA,
      },
    ],
  },
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
    requests24h: 6800,
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
          { provider: "fal", upstream: "fal-ai/kling-video/v3/pro/text-to-video", cost: 0.07 },
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
          { provider: "fal", upstream: "fal-ai/kling-video/v3.1/pro/text-to-video", cost: 0.07 },
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
    requests24h: 4100,
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
        routes: [{ provider: "google-vertex", upstream: "google/veo-3.1-generate-preview", cost: 0.2 }],
        by: MARA,
      },
      {
        id: "v2",
        label: "3.1",
        status: "live",
        isDefault: true,
        changelog: "General availability on Vertex AI, with fal as a fallback.",
        created: 12,
        released: 10,
        share: 0.9,
        input: videoInput({ durations: [4, 6, 8], resolutions: ["720p", "1080p"], aspectRatios: ["16:9", "9:16"], audio: true, lastFrame: true }),
        routes: [
          { provider: "google-vertex", upstream: "google/veo-3.1-generate-001", cost: 0.2, maxConcurrency: 120 },
          { provider: "fal", upstream: "fal-ai/veo3.1", cost: 0.28 },
        ],
        by: MARA,
      },
    ],
  },
  {
    publisher: "bytedance",
    slug: "seedance-2.5",
    name: "Seedance 2.5",
    modality: "video",
    tasks: ["text-to-video", "image-to-video", "video-to-video"],
    description: "Fast, motion-rich clips from text, images or reference video with optional sound.",
    inputs: ["text", "image", "video"],
    outputs: ["video", "audio"],
    tags: ["trending"],
    license: "BytePlus ModelArk terms",
    visibility: "public",
    created: 60,
    requests24h: 5200,
    errorRate24h: 0.016,
    latency: [38000, 45000],
    unit: "second",
    tiers: [
      ["480p", "480p", 0.09],
      ["720p", "720p", 0.14],
      ["1080p", "1080p", 0.206],
    ],
    defaultTier: "1080p",
    inputPrice: { unit: "second", price: 0.04 },
    promo: 0.5,
    output: videoOutput,
    versions: [
      {
        id: "v1",
        label: "2.5",
        status: "deprecated",
        changelog: "Launch release.",
        created: 60,
        released: 58,
        deprecated: 8,
        sunset: 50,
        replacement: "v2",
        share: 0.06,
        input: videoInput({ durations: [5, 10], resolutions: ["480p", "720p", "1080p"], audio: true, video: true }),
        routes: [{ provider: "byteplus", upstream: "seedance-2-5-pro-250812", cost: 0.13 }],
        by: MARA,
      },
      {
        id: "v2",
        label: "2.5.1",
        status: "live",
        isDefault: true,
        changelog: "Steadier motion and fewer artifacts on hands; fal and Replicate fallbacks.",
        created: 20,
        released: 9,
        share: 0.94,
        input: videoInput({ durations: [5, 10, 12], resolutions: ["480p", "720p", "1080p"], audio: true, video: true }),
        routes: [
          { provider: "byteplus", upstream: "seedance-2-5-pro-251001", cost: 0.13, maxConcurrency: 100 },
          { provider: "fal", upstream: "fal-ai/bytedance/seedance/v2.5/pro/text-to-video", cost: 0.15 },
          { provider: "replicate", upstream: "bytedance/seedance-2.5", cost: 0.155, status: "draining", changed: 1 },
        ],
        routing: { maxAttempts: 3 },
        by: MARA,
      },
      {
        id: "v3",
        label: "2.5.2",
        status: "draft",
        changelog: "Clips up to 15 s. Routes aren't set up yet.",
        created: 2,
        share: 0,
        input: videoInput({ durations: [5, 10, 12, 15], resolutions: ["480p", "720p", "1080p"], audio: true, video: true }),
        routes: [],
        by: MARA,
      },
    ],
  },
  {
    publisher: "minimax",
    slug: "hailuo-03",
    name: "Hailuo 03",
    modality: "video",
    tasks: ["text-to-video", "image-to-video"],
    description: "2K renders up to 12 seconds with physics-aware motion and first/last frame control.",
    inputs: ["text", "image"],
    outputs: ["video"],
    tags: [],
    license: "MiniMax API terms",
    visibility: "public",
    paused: {
      reason: "MiniMax is returning corrupted frames at 2K (their incident INC-4471). Paused until they confirm a fix.",
      daysAgo: 2,
    },
    created: 120,
    requests24h: 640,
    errorRate24h: 0.214,
    latency: [66000, 76000],
    unit: "second",
    tiers: [
      ["768p", "768p", 0.08],
      ["2k", "2K", 0.13],
    ],
    defaultTier: "2k",
    output: videoOutput,
    versions: [
      {
        id: "v1",
        label: "03",
        status: "live",
        isDefault: true,
        changelog: "Launch release with first and last frame control.",
        created: 120,
        released: 118,
        share: 1,
        input: videoInput({ durations: [6, 10, 12], resolutions: ["768p", "2k"], lastFrame: true }),
        routes: [
          { provider: "minimax", upstream: "MiniMax-Hailuo-03", cost: 0.09, successRate: 0.781, maxConcurrency: 50 },
          { provider: "fal", upstream: "fal-ai/minimax/hailuo-03/pro/text-to-video", cost: 0.1, successRate: 0.862 },
        ],
        by: MARA,
      },
    ],
  },
  {
    publisher: "bfl",
    slug: "flux-2-pro",
    name: "FLUX.2 Pro",
    modality: "image",
    tasks: ["text-to-image", "image-editing"],
    description: "Photoreal images with precise typography, multi-reference editing and 4MP output.",
    inputs: ["text", "image"],
    outputs: ["image"],
    tags: ["new", "typography"],
    license: "FLUX.2 [pro] API terms",
    visibility: "public",
    created: 50,
    requests24h: 9800,
    errorRate24h: 0.006,
    latency: [5200, 7000],
    unit: "image",
    tiers: [
      ["1mp", "1MP", 0.045],
      ["2mp", "2MP", 0.06],
      ["4mp", "4MP", 0.09],
    ],
    defaultTier: "1mp",
    inputPrice: { unit: "image", price: 0.015 },
    output: imageOutput,
    versions: [
      {
        id: "v1",
        label: "2.0",
        status: "live",
        isDefault: true,
        changelog: "Launch release.",
        created: 50,
        released: 48,
        share: 0.996,
        input: imageInput({ sizes: ["square_hd", "landscape_4_3", "portrait_4_3", "landscape_16_9"], maxImages: 4, references: 4 }),
        routes: [
          { provider: "replicate", upstream: "black-forest-labs/flux-2-pro", cost: 0.03 },
          { provider: "fal", upstream: "fal-ai/flux-2-pro", cost: 0.032 },
        ],
        by: MARA,
      },
      {
        id: "v2",
        label: "2.0.1",
        status: "staging",
        changelog: "Sharper typography and up to 8 reference images.",
        created: 5,
        share: 0.004,
        input: imageInput({ sizes: ["square_hd", "landscape_4_3", "portrait_4_3", "landscape_16_9"], maxImages: 4, references: 8 }),
        routes: [
          { provider: "replicate", upstream: "black-forest-labs/flux-2-pro", cost: 0.03 },
          { provider: "fal", upstream: "fal-ai/flux-2-pro/v1.0.1", cost: 0.032 },
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
    requests24h: 14200,
    errorRate24h: 0.007,
    latency: [8000, 10000],
    unit: "image",
    tiers: [
      ["1k", "1024×1024", 0.039],
      ["2k", "2048×2048", 0.078],
      ["4k", "4096×4096", 0.156],
    ],
    defaultTier: "1k",
    inputPrice: { unit: "image", price: 0.002 },
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
        routes: [{ provider: "google-vertex", upstream: "gemini-3-pro-image-preview", cost: 0.036 }],
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
          { provider: "google-vertex", upstream: "gemini-3-pro-image", cost: 0.036, maxConcurrency: 300 },
          { provider: "fal", upstream: "fal-ai/nano-banana-pro", cost: 0.0375 },
        ],
        by: MARA,
      },
    ],
  },
  {
    publisher: "bytedance",
    slug: "seedream-4.5",
    name: "Seedream 4.5",
    modality: "image",
    tasks: ["text-to-image", "batch"],
    description: "Up to 4K images and batch generation of consistent sets from a single prompt.",
    inputs: ["text", "image"],
    outputs: ["image"],
    tags: ["4k"],
    license: "BytePlus ModelArk terms",
    visibility: "public",
    created: 70,
    requests24h: 7300,
    errorRate24h: 0.008,
    latency: [6000, 8000],
    unit: "image",
    tiers: [
      ["2k", "2048×2048", 0.03],
      ["4k", "4096×4096", 0.06],
    ],
    defaultTier: "2k",
    output: imageOutput,
    versions: [
      {
        id: "v1",
        label: "4.5",
        status: "live",
        isDefault: true,
        changelog: "Launch release.",
        created: 70,
        released: 68,
        share: 1,
        input: imageInput({ sizes: ["2048x2048", "4096x4096", "2560x1440", "1440x2560"], maxImages: 15, references: 10 }),
        routes: [
          { provider: "byteplus", upstream: "seedream-4-5-251128", cost: 0.02 },
          { provider: "fal", upstream: "fal-ai/bytedance/seedream/v4.5/text-to-image", cost: 0.024 },
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
    requests24h: 5600,
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
          { provider: "fal", upstream: "fal-ai/elevenlabs/tts/eleven-v3", cost: 0.135, status: "paused", changed: 5 },
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
    requests24h: 900,
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
        routes: [{ provider: "google-vertex", upstream: "lyria-002", cost: 0.04 }],
        by: MARA,
      },
    ],
  },
  {
    publisher: "tencent",
    slug: "hunyuan3d-3",
    name: "Hunyuan3D 3",
    modality: "3d",
    tasks: ["image-to-3d", "text-to-3d"],
    description: "Textured, game-ready meshes from a single image or prompt with PBR materials.",
    inputs: ["text", "image"],
    outputs: ["3d"],
    tags: ["new", "pbr"],
    license: "Tencent Hunyuan community license",
    visibility: "public",
    created: 40,
    requests24h: 700,
    errorRate24h: 0.018,
    latency: [80000, 98000],
    unit: "mesh",
    tiers: [
      ["geometry", "Geometry only", 0.2],
      ["pbr", "PBR textured", 0.35],
    ],
    defaultTier: "pbr",
    output: meshOutput,
    versions: [
      {
        id: "v1",
        label: "3.0",
        status: "live",
        isDefault: true,
        changelog: "Launch release.",
        created: 40,
        released: 37,
        share: 1,
        input: meshInput(),
        routes: [
          { provider: "fal", upstream: "fal-ai/hunyuan3d-v3/image-to-3d", cost: 0.25 },
          { provider: "replicate", upstream: "tencent/hunyuan3d-3", cost: 0.27 },
        ],
        by: MARA,
      },
    ],
  },
  {
    publisher: "alibaba",
    slug: "wan-2.6",
    name: "Wan 2.6",
    modality: "video",
    tasks: ["text-to-video", "image-to-video", "lip-sync"],
    description: "Open-weight video model with lip-sync, character references and 1080p output.",
    inputs: ["text", "image"],
    outputs: ["video", "audio"],
    tags: ["open-weights"],
    license: "Apache-2.0",
    visibility: "public",
    created: 55,
    requests24h: 2400,
    errorRate24h: 0.013,
    latency: [44000, 50000],
    unit: "second",
    tiers: [
      ["720p", "720p", 0.05],
      ["1080p", "1080p", 0.07],
    ],
    defaultTier: "1080p",
    output: videoOutput,
    versions: [
      {
        id: "v1",
        label: "2.6",
        status: "live",
        isDefault: true,
        changelog: "Launch release.",
        created: 55,
        released: 52,
        share: 1,
        input: videoInput({ durations: [5, 10], resolutions: ["720p", "1080p"], audio: true }),
        routes: [
          { provider: "fal", upstream: "fal-ai/wan/v2.6/text-to-video", cost: 0.05, weight: 70 },
          { provider: "replicate", upstream: "wan-video/wan-2.6-t2v", cost: 0.052, weight: 30 },
        ],
        routing: { strategy: "weighted" },
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
    requests24h: 6100,
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
          { provider: "fal", upstream: "fal-ai/gpt-image-1.5", cost: 0.036 },
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
    created: 25,
    requests24h: 2900,
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
        routes: [
          { provider: "openai", upstream: "sora-2", cost: 0.1 },
          { provider: "fal", upstream: "fal-ai/sora-2/text-to-video", cost: 0.1 },
        ],
        by: MARA,
      },
    ],
  },
  {
    publisher: "runway",
    slug: "gen-4.5",
    name: "Gen-4.5",
    modality: "video",
    tasks: ["image-to-video", "text-to-video"],
    description: "Runway's latest video model. In early access for selected workspaces.",
    inputs: ["text", "image"],
    outputs: ["video"],
    tags: ["early-access"],
    license: "Runway API terms",
    visibility: "unlisted",
    created: 9,
    requests24h: 380,
    errorRate24h: 0.024,
    latency: [55000, 62000],
    unit: "second",
    tiers: [["720p", "720p", 0.18]],
    defaultTier: "720p",
    output: videoOutput,
    versions: [
      {
        id: "v1",
        label: "4.5",
        status: "live",
        isDefault: true,
        changelog: "Early access.",
        created: 9,
        released: 7,
        share: 1,
        input: videoInput({ durations: [5, 10], resolutions: ["720p"], aspectRatios: ["16:9", "9:16", "1:1"] }),
        routes: [{ provider: "runway", upstream: "gen4.5", cost: 0.12, maxConcurrency: 20 }],
        by: ANIL,
      },
    ],
  },
  {
    publisher: "topaz",
    slug: "image-upscale",
    name: "Topaz Image Upscale",
    modality: "image",
    tasks: ["upscaling"],
    description: "Upscale photos and renders up to 4× while rebuilding texture instead of smearing it.",
    inputs: ["image"],
    outputs: ["image"],
    tags: ["upscaling"],
    license: "Topaz Labs API terms",
    visibility: "public",
    created: 65,
    requests24h: 3300,
    errorRate24h: 0.003,
    latency: [6000, 9000],
    unit: "megapixel",
    tiers: [
      ["standard", "Standard", 0.008],
      ["hifi", "High fidelity", 0.016],
    ],
    defaultTier: "standard",
    output: imageOutput,
    versions: [
      {
        id: "v1",
        label: "1.0",
        status: "live",
        isDefault: true,
        changelog: "Launch release. Billed per output megapixel.",
        created: 65,
        released: 63,
        share: 1,
        input: upscaleInput(),
        routes: [
          { provider: "fal", upstream: "fal-ai/topaz/upscale/image", cost: 0.005 },
          { provider: "replicate", upstream: "topazlabs/image-upscale", cost: 0.0055 },
        ],
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
    requests24h: 8800,
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
  const requests24h = Math.round(model.requests24h * seed.share);
  const shares = routeShares(seed.routes, routing.strategy === "weighted");
  const routes: Route[] = seed.routes.map((route, index) => {
    const provider = providers.find((p) => p.id === route.provider);
    const traffic = Math.round(requests24h * shares[index]);
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
      cost: { unit: model.unit, price: route.cost },
      region: route.region ?? provider?.regions[0] ?? "us",
      maxConcurrency: route.maxConcurrency ?? null,
      health:
        traffic > 0
          ? {
              successRate: round(route.successRate ?? random.float(0.975, 0.998), 4),
              p50Ms: p50,
              p95Ms: Math.round(p50 * random.float(1.6, 2.2)),
              requests24h: traffic,
            }
          : { successRate: null, p50Ms: null, p95Ms: null, requests24h: 0 },
      updatedAt: iso(Math.min(changedAt, now - MINUTE)),
    };
  });
  const pricing: Pricing = {
    unit: model.unit,
    defaultTier: model.defaultTier,
    tiers: model.tiers.map(([id, label, price]) => ({ id, label, price, cost: null })),
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
    requests24h,
  };
}

/** The seeded catalog. */
export function seedCatalog(now: number, random: Random, providers: ProviderRecord[]): ModelRecord[] {
  return MODELS.map((seed) => {
    const versionList = seed.versions.map((version) => buildVersion(seed, version, now, random, providers));
    const live = versionList.find((version) => version.isDefault) ?? null;
    const typical = TYPICAL_UNITS[seed.unit];
    const price = live ? defaultTier(live.pricing).price : 0;
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
      featured: seed.featured ?? false,
      defaultVersion: live?.id ?? null,
      requests24h: seed.requests24h,
      errorRate24h: seed.errorRate24h,
      revenue30d: money(seed.requests24h * 30 * 0.88 * typical * price * random.float(0.95, 1.05)),
      createdAt: iso(now - seed.created * DAY - 10 * HOUR),
      updatedAt: changes.sort().at(-1) ?? iso(now - seed.created * DAY),
      description: seed.description,
      inputs: seed.inputs,
      outputs: seed.outputs,
      tags: seed.tags,
      license: seed.license,
      pausedReason: seed.paused?.reason ?? null,
      versionList,
    };
  });
}

/** What each provider was paid over 30 days, from its routes' traffic. */
export function providerCost30d(models: ModelRecord[], providerId: string): number {
  return money(
    sum(models, (model) =>
      sum(model.versionList, (version) =>
        sum(
          version.routes.filter((route) => route.providerId === providerId),
          (route) => route.health.requests24h * 30 * 0.86 * TYPICAL_UNITS[route.cost.unit] * route.cost.price,
        ),
      ),
    ),
  );
}
