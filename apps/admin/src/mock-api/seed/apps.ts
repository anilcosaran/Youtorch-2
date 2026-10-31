import type { AppCategory, AppStatus, AppStep, ReleaseStatus } from "@modelvend/admin-api/apps";
import type { JsonSchema } from "@modelvend/admin-api/models";
import type { Random } from "../random";
import type { AppRecord } from "../types";
import { DAY, HOUR, iso, toMicros } from "../util";

interface ReleaseSeed {
  status: ReleaseStatus;
  steps: AppStep[];
  stages: string[];
  outputMap: Record<string, unknown>;
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
  input: JsonSchema;
  output: JsonSchema;
  releases: ReleaseSeed[];
}

const MARA = "Mara Lindqvist";
const ANIL = "Anıl Coşaran";

const DIALECT = "https://json-schema.org/draft/2020-12/schema";
const uri = { type: "string", format: "uri" };

function inputOf(properties: Record<string, unknown>, required: string[]): JsonSchema {
  return { $schema: DIALECT, type: "object", properties, required, additionalProperties: false };
}

const fileOutput = (field: string): JsonSchema => ({ $schema: DIALECT, type: "object", properties: { [field]: uri }, required: [field] });

const IMAGE_OUTPUT = { image: "{{steps.render.output.images}}" };

const cutout = (version: string, prompt: string): AppStep => ({
  id: "render",
  stage: "Cutting out",
  model: `google/nano-banana-pro@${version}`,
  input: { prompt, reference_image_urls: ["{{input.image}}"], image_size: "1024x1024", output_format: "png" },
});

const boost: AppStep = {
  id: "boost",
  stage: "Writing the scene",
  model: "modelvend/prompt-boost-1@v1",
  input: { prompt: "{{input.scene}} product photo", target: "image", style: "commercial studio, soft shadows" },
};

const voice = (version: string): AppStep => ({
  id: "speak",
  stage: "Speaking",
  model: `elevenlabs/eleven-v3@${version}`,
  input: { text: "{{input.script}}", voice_id: "{{input.voice}}", language_code: "{{input.language}}" },
});

const revoice = (extra: Record<string, unknown>): AppStep => ({
  id: "speak",
  stage: "Re-voicing",
  model: "elevenlabs/eleven-v3@v2",
  input: { text: "{{input.transcript}}", voice_id: "{{input.voice}}", ...extra },
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
    input: inputOf({ image: uri }, ["image"]),
    output: fileOutput("image"),
    releases: [
      {
        status: "superseded",
        steps: [cutout("2026-06-12", "Remove the background. Keep the subject untouched with clean edges.")],
        stages: ["Cutting out"],
        outputMap: IMAGE_OUTPUT,
        price: 0.05,
        notes: "First release.",
        created: 90,
        published: 89,
        by: MARA,
      },
      {
        status: "live",
        steps: [cutout("2026-09-30", "Remove the background. Keep the subject untouched; keep soft hair and fur edges.")],
        stages: ["Cutting out"],
        outputMap: IMAGE_OUTPUT,
        price: 0.06,
        notes: "Moved to the September Nano Banana Pro release.",
        created: 15,
        published: 14,
        by: MARA,
      },
    ],
  },
  {
    slug: "image-to-video",
    name: "Image to Video",
    tagline: "Bring a still to life.",
    description: "Turn a photo into a short clip with the motion and camera move you pick.",
    category: "video",
    status: "live",
    runs24h: 1300,
    input: inputOf({ image: uri, motion: { type: "string", enum: ["Subtle", "Dynamic"] }, camera: { type: "string", enum: ["static", "push-in", "orbit"] } }, ["image"]),
    output: fileOutput("video"),
    releases: [
      {
        status: "live",
        steps: [
          {
            id: "render",
            stage: "Animating",
            model: "kling/kling-3@v3",
            input: { image_url: "{{input.image}}", prompt: "{{input.motion}} motion, {{input.camera}} camera", duration: 5, resolution: "1080p" },
          },
        ],
        stages: ["Animating"],
        outputMap: { video: "{{steps.render.output.video}}" },
        price: 0.95,
        notes: "First release.",
        created: 40,
        published: 39,
        by: MARA,
      },
    ],
  },
  {
    slug: "product-shots",
    name: "Product Shots",
    tagline: "Studio shots from one product photo.",
    description: "Describe the scene and get two studio-quality shots of your product in it.",
    category: "image",
    status: "live",
    runs24h: 900,
    input: inputOf({ image: uri, scene: { type: "string", enum: ["Studio", "Travertine", "Splash", "Outdoor"] } }, ["image"]),
    output: fileOutput("image"),
    releases: [
      {
        status: "live",
        steps: [
          boost,
          {
            id: "render",
            stage: "Rendering",
            model: "google/nano-banana-pro@2026-09-30",
            input: { prompt: "{{steps.boost.output.prompt}}", reference_image_urls: ["{{input.image}}"], num_images: 2, image_size: "2048x2048" },
          },
        ],
        stages: ["Writing the scene", "Rendering"],
        outputMap: IMAGE_OUTPUT,
        price: 0.32,
        notes: "Moved rendering to Nano Banana Pro.",
        created: 20,
        published: 19,
        by: MARA,
      },
      {
        status: "draft",
        steps: [
          boost,
          {
            id: "render",
            stage: "Rendering",
            model: "openai/gpt-image-1.5@v1",
            input: { prompt: "{{steps.boost.output.prompt}}", num_images: 2 },
          },
        ],
        stages: ["Writing the scene", "Rendering"],
        outputMap: IMAGE_OUTPUT,
        price: 0.32,
        notes: "Trying GPT Image for rendering.",
        created: 2,
        by: MARA,
      },
    ],
  },
  {
    slug: "voiceover",
    name: "Voiceover",
    tagline: "Natural narration in any language.",
    description: "Paste a script and pick a voice; get narration with natural pacing.",
    category: "audio",
    status: "live",
    runs24h: 1100,
    input: inputOf({ script: { type: "string" }, voice: { type: "string" }, language: { type: "string" } }, ["script", "voice"]),
    output: fileOutput("audio"),
    releases: [
      {
        status: "live",
        steps: [voice("v2")],
        stages: ["Speaking"],
        outputMap: { audio: "{{steps.speak.output.audio}}" },
        price: 0.25,
        notes: "Eleven v3 GA with audio tags.",
        created: 90,
        published: 89,
        by: ANIL,
      },
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
    input: inputOf({ transcript: { type: "string" }, voice: { type: "string" } }, ["transcript", "voice"]),
    output: fileOutput("audio"),
    releases: [
      {
        status: "superseded",
        steps: [revoice({ stability: 0.4 })],
        stages: ["Re-voicing"],
        outputMap: { audio: "{{steps.speak.output.audio}}" },
        price: 0.3,
        notes: "First release.",
        created: 50,
        published: 49,
        by: ANIL,
      },
      {
        status: "live",
        steps: [revoice({ stability: 0.4, similarity_boost: 0.9 })],
        stages: ["Re-voicing"],
        outputMap: { audio: "{{steps.speak.output.audio}}" },
        price: 0.3,
        notes: "Keeps breaths and timing closer to the original.",
        created: 22,
        published: 21,
        by: ANIL,
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
    input: inputOf({ mood: { type: "string" }, genre: { type: "string" } }, ["mood"]),
    output: fileOutput("audio"),
    releases: [
      {
        status: "draft",
        steps: [
          {
            id: "compose",
            stage: "Composing",
            model: "google/lyria-2@v1",
            input: { prompt: "{{input.mood}} instrumental, {{input.genre}}" },
          },
        ],
        stages: ["Composing"],
        outputMap: { audio: "{{steps.compose.output.audio}}" },
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
      stages: release.stages,
      outputMap: release.outputMap,
      priceMicros: toMicros(release.price),
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
      inputSchema: seed.input,
      outputSchema: seed.output,
      pausedReason: seed.paused?.reason ?? null,
      runs24h: seed.runs24h,
      revenue30dMicros: live ? toMicros(seed.runs24h * 30 * 0.9 * live.price * random.float(0.95, 1.05)) : 0,
      updatedAt: changes.sort().at(-1) ?? iso(now),
      releases,
    };
  });
}
