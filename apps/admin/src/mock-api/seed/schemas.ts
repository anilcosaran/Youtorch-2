import type { JsonSchema, Modality } from "@modelvend/admin-api/models";

/*
 * Input and output schemas (JSON Schema draft 2020-12) for the seeded
 * versions, one builder per kind of model.
 */

const DIALECT = "https://json-schema.org/draft/2020-12/schema";

const seed = { type: "integer", minimum: 0, maximum: 2147483647, description: "Same seed and input give the same output." };
const uri = (description: string) => ({ type: "string", format: "uri", description });

function object(properties: Record<string, unknown>, required: string[]): JsonSchema {
  return { $schema: DIALECT, type: "object", properties, required, additionalProperties: false };
}

export interface VideoOptions {
  durations: number[];
  resolutions: string[];
  aspectRatios?: string[];
  /** Whether it can generate a soundtrack. */
  audio?: boolean;
  /** Whether it takes reference video. */
  video?: boolean;
  lastFrame?: boolean;
}

export function videoInput(o: VideoOptions): JsonSchema {
  const properties: Record<string, unknown> = {
    prompt: { type: "string", minLength: 1, maxLength: 2500, description: "What happens in the clip, including camera moves." },
    negative_prompt: { type: "string", maxLength: 1000, description: "What to keep out of the clip." },
    image_url: uri("First frame. Makes the request image-to-video."),
    ...(o.lastFrame ? { last_frame_url: uri("Last frame the clip ends on.") } : {}),
    ...(o.video ? { video_url: uri("Reference clip for motion and style; billed per input second.") } : {}),
    duration: { type: "integer", enum: o.durations, default: o.durations[0], description: "Length in seconds." },
    resolution: { type: "string", enum: o.resolutions, default: o.resolutions[o.resolutions.length > 1 ? 1 : 0] },
    aspect_ratio: { type: "string", enum: o.aspectRatios ?? ["16:9", "9:16", "1:1"], default: "16:9" },
    ...(o.audio ? { generate_audio: { type: "boolean", default: true, description: "Generate dialogue, effects and ambience." } } : {}),
    seed,
  };
  return object(properties, ["prompt"]);
}

export const videoOutput: JsonSchema = object(
  {
    video: {
      type: "object",
      properties: {
        url: uri("The MP4, kept for 30 days."),
        content_type: { type: "string", const: "video/mp4" },
        duration: { type: "number", description: "Seconds." },
        width: { type: "integer" },
        height: { type: "integer" },
      },
      required: ["url", "content_type", "duration"],
    },
    seed: { type: "integer" },
  },
  ["video"],
);

export interface ImageOptions {
  sizes: string[];
  maxImages: number;
  /** How many reference images it takes; 0 for none. */
  references: number;
  /** Takes a source image to edit or upscale. */
  edit?: boolean;
}

export function imageInput(o: ImageOptions): JsonSchema {
  const properties: Record<string, unknown> = {
    prompt: { type: "string", minLength: 1, maxLength: 4000, description: "What to draw, or how to change the reference images." },
    image_size: { type: "string", enum: o.sizes, default: o.sizes[0] },
    num_images: { type: "integer", minimum: 1, maximum: o.maxImages, default: 1 },
    ...(o.references > 0
      ? { reference_image_urls: { type: "array", items: uri("A reference image."), maxItems: o.references, description: "Billed per image." } }
      : {}),
    output_format: { type: "string", enum: ["png", "jpeg", "webp"], default: "png" },
    seed,
  };
  return object(properties, ["prompt"]);
}

export function upscaleInput(): JsonSchema {
  return object(
    {
      image_url: uri("The image to upscale; up to 16 MP."),
      scale: { type: "integer", enum: [2, 4], default: 2 },
      content: { type: "string", enum: ["photo", "illustration"], default: "photo" },
      output_format: { type: "string", enum: ["png", "jpeg"], default: "png" },
    },
    ["image_url"],
  );
}

export const imageOutput: JsonSchema = object(
  {
    images: {
      type: "array",
      items: {
        type: "object",
        properties: {
          url: uri("The image, kept for 30 days."),
          content_type: { type: "string", enum: ["image/png", "image/jpeg", "image/webp"] },
          width: { type: "integer" },
          height: { type: "integer" },
        },
        required: ["url", "content_type"],
      },
      minItems: 1,
    },
    seed: { type: "integer" },
  },
  ["images"],
);

export function speechInput(o: { expressive: boolean }): JsonSchema {
  return object(
    {
      text: {
        type: "string",
        minLength: 1,
        maxLength: 10000,
        description: o.expressive ? "The script. Tags like [whispers] or [laughs] steer delivery." : "The script.",
      },
      voice_id: { type: "string", default: "aria", description: "A library voice or a cloned voice ID." },
      language_code: { type: "string", pattern: "^[a-z]{2}$", description: "ISO 639-1; detected when omitted." },
      stability: { type: "number", minimum: 0, maximum: 1, default: 0.5 },
      similarity_boost: { type: "number", minimum: 0, maximum: 1, default: 0.75 },
      ...(o.expressive ? { style: { type: "number", minimum: 0, maximum: 1, default: 0 } } : {}),
      output_format: { type: "string", enum: ["mp3_44100_128", "mp3_44100_192", "pcm_24000", "opus_48000_64"], default: "mp3_44100_128" },
    },
    ["text"],
  );
}

export function musicInput(): JsonSchema {
  return object(
    {
      prompt: { type: "string", minLength: 1, maxLength: 1000, description: "Genre, mood and instruments." },
      negative_prompt: { type: "string", maxLength: 500 },
      bpm: { type: "integer", minimum: 60, maximum: 200 },
      stems: { type: "boolean", default: false, description: "Also return drums, bass and melody separately." },
      seed,
    },
    ["prompt"],
  );
}

export const audioOutput: JsonSchema = object(
  {
    audio: {
      type: "object",
      properties: {
        url: uri("The audio file, kept for 30 days."),
        content_type: { type: "string", enum: ["audio/mpeg", "audio/wav", "audio/ogg"] },
        duration: { type: "number", description: "Seconds." },
      },
      required: ["url", "content_type"],
    },
  },
  ["audio"],
);

export function meshInput(): JsonSchema {
  return object(
    {
      image_url: uri("A single object on a plain background works best."),
      prompt: { type: "string", maxLength: 1000, description: "Used when there is no image." },
      texture: { type: "string", enum: ["none", "pbr"], default: "pbr", description: "`none` returns geometry only." },
      format: { type: "string", enum: ["glb", "fbx", "obj", "usdz"], default: "glb" },
      face_count: { type: "integer", minimum: 10000, maximum: 500000, default: 150000 },
      seed,
    },
    [],
  );
}

export const meshOutput: JsonSchema = object(
  {
    mesh: {
      type: "object",
      properties: {
        url: uri("The mesh, kept for 30 days."),
        format: { type: "string", enum: ["glb", "fbx", "obj", "usdz"] },
        content_type: { type: "string" },
      },
      required: ["url", "format"],
    },
    thumbnail: { type: "object", properties: { url: uri("A PNG preview.") }, required: ["url"] },
  },
  ["mesh"],
);

export function promptInput(): JsonSchema {
  return object(
    {
      prompt: { type: "string", minLength: 1, maxLength: 4000, description: "The user's prompt." },
      target: { type: "string", enum: ["image", "video", "music"], default: "image" },
      style: { type: "string", maxLength: 200, description: "House style to steer toward." },
    },
    ["prompt"],
  );
}

export const promptOutput: JsonSchema = object(
  {
    prompt: { type: "string", description: "The rewritten prompt." },
    negative_prompt: { type: "string" },
    usage: {
      type: "object",
      properties: { input_tokens: { type: "integer" }, output_tokens: { type: "integer" } },
      required: ["input_tokens", "output_tokens"],
    },
  },
  ["prompt"],
);

/** What a new model's draft `v1` starts with. */
export const EMPTY_INPUT: JsonSchema = { type: "object", properties: { prompt: { type: "string" } }, required: ["prompt"] };

/** A starting output schema for a modality. */
export function outputFor(modality: Modality): JsonSchema {
  switch (modality) {
    case "video":
      return videoOutput;
    case "image":
      return imageOutput;
    case "audio":
      return audioOutput;
    case "3d":
      return meshOutput;
    case "text":
      return promptOutput;
  }
}
