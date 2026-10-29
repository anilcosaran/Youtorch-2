import type { AppCategory, AppStatus, AppStep, ReleaseStatus } from "@modelvend/admin-api/apps";
import type { Random } from "../random";
import type { AppRecord } from "../types";
import { DAY, HOUR, iso, money } from "../util";

interface ReleaseSeed {
  status: ReleaseStatus;
  steps: AppStep[];
  price: number;
  notes: string;
  /** Days ago. */
  created: number;
  published?: number;
  by: string;
}

interface AppSeed {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: AppCategory;
  status: AppStatus;
  paused?: { reason: string; daysAgo: number };
  runs24h: number;
  releases: ReleaseSeed[];
}

const MARA = "Mara Lindqvist";
const ANIL = "Anıl Coşaran";

const cutout = (version: string, prompt: string): AppStep => ({
  id: "cutout",
  name: "Cut out",
  modelId: "google/nano-banana-pro",
  version,
  params: { prompt, reference_image_urls: ["{{input.image}}"], image_size: "1024x1024", output_format: "png" },
});

const boost: AppStep = {
  id: "boost",
  name: "Write the scene",
  modelId: "modelvend/prompt-boost-1",
  version: "v1",
  params: { prompt: "{{input.scene}} product photo", target: "image", style: "commercial studio, soft shadows" },
};

const voice = (version: string): AppStep => ({
  id: "speak",
  name: "Speak",
  modelId: "elevenlabs/eleven-v3",
  version,
  params: { text: "{{input.script}}", voice_id: "{{input.voice}}", language_code: "{{input.language}}" },
});

const revoice = (extra: Record<string, unknown>): AppStep => ({
  id: "revoice",
  name: "Re-voice",
  modelId: "elevenlabs/eleven-v3",
  version: "v2",
  params: { text: "{{input.transcript}}", voice_id: "{{input.voice}}", ...extra },
});

const SEEDS: AppSeed[] = [
  {
    slug: "background-remover",
    name: "Background Remover",
    tagline: "Clean cutouts with soft hair edges.",
    description: "Drop a photo and get a transparent PNG in seconds. Hair, fur and glass keep their soft edges.",
    category: "image",
    status: "live",
    runs24h: 2100,
    releases: [
      {
        status: "superseded",
        steps: [cutout("2026-06-12", "Remove the background. Keep the subject untouched with clean edges.")],
        price: 0.05,
        notes: "First release.",
        created: 90,
        published: 89,
        by: MARA,
      },
      {
        status: "superseded",
        steps: [cutout("2026-06-12", "Remove the background. Keep the subject untouched; keep soft hair and fur edges.")],
        price: 0.06,
        notes: "Softer hair edges.",
        created: 40,
        published: 39,
        by: MARA,
      },
      {
        status: "live",
        steps: [cutout("2026-09-30", "Remove the background. Keep the subject untouched; keep soft hair and fur edges.")],
        price: 0.06,
        notes: "Moved to the September Nano Banana Pro release.",
        created: 15,
        published: 14,
        by: MARA,
      },
    ],
  },
  {
    slug: "upscaler",
    name: "4K Upscaler",
    tagline: "Recover fine detail without halos.",
    description: "Upscale photos and renders up to 4× while rebuilding texture instead of smearing it.",
    category: "image",
    status: "live",
    runs24h: 1600,
    releases: [
      {
        status: "superseded",
        steps: [
          {
            id: "upscale",
            name: "Upscale",
            modelId: "bytedance/seedream-4.5",
            version: "v1",
            params: { prompt: "Upscale to 4K. Keep every detail; add nothing new.", reference_image_urls: ["{{input.image}}"], image_size: "4096x4096" },
          },
        ],
        price: 0.09,
        notes: "First release.",
        created: 60,
        published: 59,
        by: MARA,
      },
      {
        status: "live",
        steps: [
          {
            id: "upscale",
            name: "Upscale",
            modelId: "topaz/image-upscale",
            version: "v1",
            params: { image_url: "{{input.image}}", scale: "{{input.scale}}", content: "{{input.style}}" },
          },
        ],
        price: 0.12,
        notes: "Switched to Topaz: sharper detail and no invented content.",
        created: 30,
        published: 29,
        by: MARA,
      },
    ],
  },
  {
    slug: "image-to-video",
    name: "Image to Video",
    tagline: "Turn any still into a moving shot.",
    description: "Animate a photo or artwork with natural motion and a camera move of your choice.",
    category: "video",
    status: "live",
    runs24h: 900,
    releases: [
      {
        status: "superseded",
        steps: [
          {
            id: "animate",
            name: "Animate",
            modelId: "modelvend/lumen-1",
            version: "v1",
            params: { image_url: "{{input.image}}", prompt: "{{input.motion}} motion, {{input.camera}} camera", duration: 5, resolution: "1080p" },
          },
        ],
        price: 0.95,
        notes: "First release.",
        created: 120,
        published: 118,
        by: ANIL,
      },
      {
        status: "live",
        steps: [
          {
            id: "animate",
            name: "Animate",
            modelId: "modelvend/lumen-1",
            version: "v2",
            params: {
              image_url: "{{input.image}}",
              prompt: "{{input.motion}} motion, {{input.camera}} camera",
              duration: 5,
              resolution: "1080p",
              generate_audio: false,
            },
          },
        ],
        price: 0.95,
        notes: "Lumen 2.0: smoother motion and real camera paths.",
        created: 20,
        published: 19,
        by: ANIL,
      },
    ],
  },
  {
    slug: "product-shots",
    name: "Product Shots",
    tagline: "Studio-grade product photos from one picture.",
    description: "Place your product in a lit studio scene with realistic shadows and reflections.",
    category: "image",
    status: "live",
    runs24h: 1300,
    releases: [
      {
        status: "superseded",
        steps: [
          {
            id: "render",
            name: "Render",
            modelId: "bfl/flux-2-pro",
            version: "v1",
            params: { prompt: "Studio product photo, {{input.scene}} scene, soft shadows", reference_image_urls: ["{{input.image}}"], num_images: 2 },
          },
        ],
        price: 0.15,
        notes: "First release.",
        created: 48,
        published: 47,
        by: MARA,
      },
      {
        status: "superseded",
        steps: [
          boost,
          {
            id: "render",
            name: "Render",
            modelId: "bfl/flux-2-pro",
            version: "v1",
            params: { prompt: "{{steps.boost.prompt}}", reference_image_urls: ["{{input.image}}"], num_images: 2 },
          },
        ],
        price: 0.15,
        notes: "Prompt Boost writes the scene description.",
        created: 30,
        published: 29,
        by: MARA,
      },
      {
        status: "live",
        steps: [
          boost,
          {
            id: "render",
            name: "Render",
            modelId: "bfl/flux-2-pro",
            version: "v1",
            params: { prompt: "{{steps.boost.prompt}}", reference_image_urls: ["{{input.image}}"], num_images: 2, image_size: "landscape_4_3" },
          },
        ],
        price: 0.16,
        notes: "Landscape framing by default.",
        created: 10,
        published: 9,
        by: MARA,
      },
      {
        status: "draft",
        steps: [
          boost,
          {
            id: "render",
            name: "Render",
            modelId: "google/nano-banana-pro",
            version: "2026-09-30",
            params: { prompt: "{{steps.boost.prompt}}", reference_image_urls: ["{{input.image}}"], num_images: 2, image_size: "2048x2048" },
          },
        ],
        price: 0.18,
        notes: "Trying Nano Banana Pro for better reflections on glass and metal.",
        created: 1,
        by: MARA,
      },
    ],
  },
  {
    slug: "voiceover",
    name: "Voiceover",
    tagline: "Expressive narration in 70+ languages.",
    description: "Paste a script and get studio-quality narration with natural pauses and emotion.",
    category: "audio",
    status: "live",
    runs24h: 2400,
    releases: [
      { status: "superseded", steps: [voice("v1")], price: 0.25, notes: "First release, on the v3 alpha.", created: 170, published: 169, by: ANIL },
      { status: "live", steps: [voice("v2")], price: 0.25, notes: "Eleven v3 GA with audio tags.", created: 90, published: 89, by: ANIL },
    ],
  },
  {
    slug: "voice-changer",
    name: "Voice Changer",
    tagline: "Say it once, hear it in any voice.",
    description: "Upload a recording and swap the voice while keeping timing, emotion and breaths.",
    category: "audio",
    status: "paused",
    paused: { reason: "Voice consent checks are under review after a misuse report.", daysAgo: 4 },
    runs24h: 140,
    releases: [
      {
        status: "superseded",
        steps: [revoice({ stability: 0.4 })],
        price: 0.3,
        notes: "First release.",
        created: 50,
        published: 49,
        by: ANIL,
      },
      {
        status: "live",
        steps: [revoice({ stability: 0.4, similarity_boost: 0.9 })],
        price: 0.3,
        notes: "Keeps breaths and timing closer to the original.",
        created: 22,
        published: 21,
        by: ANIL,
      },
    ],
  },
  {
    slug: "image-to-3d",
    name: "Image to 3D",
    tagline: "Game-ready meshes from a single image.",
    description: "Turn a concept or product photo into a textured 3D model you can drop into any engine.",
    category: "3d",
    status: "live",
    runs24h: 260,
    releases: [
      {
        status: "live",
        steps: [
          {
            id: "mesh",
            name: "Build mesh",
            modelId: "tencent/hunyuan3d-3",
            version: "v1",
            params: { image_url: "{{input.image}}", texture: "pbr", format: "{{input.format}}" },
          },
        ],
        price: 0.45,
        notes: "First release.",
        created: 35,
        published: 34,
        by: MARA,
      },
    ],
  },
  {
    slug: "music-bed",
    name: "Music Bed",
    tagline: "Royalty-free background music in seconds.",
    description: "Describe a mood and get a 30-second instrumental bed for videos and podcasts.",
    category: "audio",
    status: "draft",
    runs24h: 0,
    releases: [
      {
        status: "draft",
        steps: [
          {
            id: "compose",
            name: "Compose",
            modelId: "google/lyria-2",
            version: "v1",
            params: { prompt: "{{input.mood}} instrumental, {{input.genre}}", bpm: "{{input.bpm}}" },
          },
        ],
        price: 0.1,
        notes: "",
        created: 3,
        by: MARA,
      },
    ],
  },
];

export function seedApps(now: number, random: Random): AppRecord[] {
  return SEEDS.map((seed) => {
    const releases = seed.releases.map((release, index) => ({
      number: index + 1,
      status: release.status,
      steps: release.steps,
      price: release.price,
      notes: release.notes,
      createdAt: iso(now - release.created * DAY - random.int(1, 8) * HOUR),
      createdBy: release.by,
      publishedAt: release.published === undefined ? null : iso(now - release.published * DAY - random.int(1, 8) * HOUR),
    }));
    const live = seed.releases.find((release) => release.status === "live");
    const pausedAt = seed.paused ? now - seed.paused.daysAgo * DAY - 2 * HOUR : null;
    const changes = releases.flatMap((r) => [r.createdAt, r.publishedAt]).filter((at): at is string => at !== null);
    if (pausedAt !== null) changes.push(iso(pausedAt));
    return {
      slug: seed.slug,
      name: seed.name,
      tagline: seed.tagline,
      description: seed.description,
      category: seed.category,
      status: seed.status,
      pausedReason: seed.paused?.reason ?? null,
      runs24h: seed.runs24h,
      revenue30d: live ? money(seed.runs24h * 30 * 0.9 * live.price * random.float(0.95, 1.05)) : 0,
      updatedAt: changes.sort().at(-1) ?? iso(now),
      releases,
    };
  });
}
