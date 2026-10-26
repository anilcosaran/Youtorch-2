import {
  Activity,
  Box,
  Clock3,
  Dices,
  Gauge,
  Gem,
  Images,
  Layers,
  Mic,
  RectangleHorizontal,
  Video,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { formatPrice } from "@/lib/format";
import { mediumMeta } from "@/lib/modality";
import { discounted, promoRate, roundMicros } from "@/lib/pricing";
import type { Medium, Model } from "@/types/model";

export type ControlValue = string | boolean;
export type PlaygroundValues = Record<string, ControlValue>;

export interface Option {
  value: string;
  label: string;
  description?: string;
}

/**
 * `quick` controls render as the chip row under the prompt, `toggle` as switches inside the prompt card,
 * and `advanced` inside the collapsible advanced section.
 */
export type Control = { id: string; label: string; icon: LucideIcon } & (
  | { kind: "choice"; group: "quick" | "advanced"; options: Option[]; initial: string }
  | { kind: "toggle"; group: "toggle"; initial: boolean }
  | { kind: "seed"; group: "advanced"; initial: string }
);

export interface PlaygroundRun {
  id: number;
  prompt: string;
  mode?: string;
  values: PlaygroundValues;
  /** Readable settings, e.g. ["5s", "16:9", "1080p"]. */
  labels: string[];
  cost: number;
  ratio: number;
  /** Mock result frames, one per generated item; empty for audio. */
  media: string[];
  /** File an app ran on, kept for before/after views. */
  source?: string;
  status: "rendering" | "done";
  progress: number;
  seconds?: number;
}

export interface ReferenceSlot {
  label: string;
  accept: Medium[];
  max: number;
  required: boolean;
}

const options = (...values: string[]): Option[] => values.map((value) => ({ value, label: value }));
const has = (model: Model, capability: string) => model.capabilities.includes(capability);

export const isSpeech = (model: Model) => has(model, "Text → Speech");

/** Generation modes such as "Text → Video" and "Image → Video"; the first one is the default. */
export function playgroundModes(model: Model) {
  return model.capabilities.filter((c) => c.includes("→"));
}

const modeInput = (mode: string | undefined) => (mode?.split(" → ")[0].toLowerCase() ?? "text") as Medium;

export const modeLabel = (mode: string) => mode.replace(" → ", " to ");

const modeHints: Partial<Record<Medium, string>> = {
  text: "Start from a written prompt",
  image: "Start from an image",
  video: "Start from a clip",
  audio: "Start from a recording",
};

/** The mode picker, shaped as a choice control so it shares the setting chip's menu. */
export function modeControl(modes: string[], mode?: string): Extract<Control, { kind: "choice" }> {
  return {
    id: "mode",
    label: "Mode",
    icon: mediumMeta[modeInput(mode)].icon,
    kind: "choice",
    group: "quick",
    initial: modes[0],
    options: modes.map((m) => ({ value: m, label: modeLabel(m), description: modeHints[modeInput(m)] })),
  };
}

function maxSeconds(model: Model) {
  const match = model.maxOutput.match(/(\d+)\s*s\b/);
  return match ? Number(match[1]) : 5;
}

function tierControl(model: Model, label: string, icon: LucideIcon): Control | null {
  if (model.tiers.length < 2) return null;
  const tiers = model.tiers.map((t) => ({
    value: t.label,
    label: t.label,
    description: `${formatPrice(discounted(model, t.price))} per ${model.unit}`,
  }));
  const initial = model.tiers.find((t) => t.price === model.price)?.label ?? tiers[0].value;
  return { id: "tier", label, icon, kind: "choice", group: "quick", options: tiers, initial };
}

const voices: Option[] = [
  { value: "Aria", label: "Aria", description: "Warm narrator" },
  { value: "Roger", label: "Roger", description: "Deep, confident" },
  { value: "Sarah", label: "Sarah", description: "Soft, friendly" },
  { value: "Kai", label: "Kai", description: "Young, energetic" },
];

const seed: Control = { id: "seed", label: "Seed", icon: Dices, kind: "seed", group: "advanced", initial: "" };

/** Settings for the playground form, picked from what the model actually supports. */
export function playgroundControls(model: Model): Control[] {
  const controls: (Control | null)[] = [];

  switch (model.modality) {
    case "video": {
      const max = maxSeconds(model);
      const durations = [...new Set([5, 10, max].filter((d) => d <= max))].sort((a, b) => a - b);
      controls.push(
        {
          id: "duration",
          label: "Duration",
          icon: Clock3,
          kind: "choice",
          group: "quick",
          options: durations.map((d) => ({ value: `${d}`, label: `${d}s` })),
          initial: `${durations[0]}`,
        },
        {
          id: "aspect",
          label: "Aspect ratio",
          icon: RectangleHorizontal,
          kind: "choice",
          group: "quick",
          options: options("16:9", "9:16", "1:1"),
          initial: "16:9",
        },
        tierControl(model, "Resolution", Gem),
      );
      if (model.outputs.includes("audio") && !model.tiers.some((t) => /no audio/i.test(t.label))) {
        controls.push({ id: "audio", label: "Audio", icon: Volume2, kind: "toggle", group: "toggle", initial: true });
      }
      if (has(model, "Multi-shot"))
        controls.push({ id: "multiShot", label: "Multi-shot", icon: Layers, kind: "toggle", group: "toggle", initial: false });
      if (has(model, "Camera paths")) {
        controls.push({
          id: "camera",
          label: "Camera",
          icon: Video,
          kind: "choice",
          group: "advanced",
          options: options("Static", "Dolly in", "Orbit", "Crane up", "Handheld"),
          initial: "Static",
        });
      }
      break;
    }
    case "image":
      controls.push(
        {
          id: "aspect",
          label: "Aspect ratio",
          icon: RectangleHorizontal,
          kind: "choice",
          group: "quick",
          options: options("1:1", "4:3", "3:4", "16:9", "9:16"),
          initial: "1:1",
        },
        tierControl(model, "Resolution", Gem),
        {
          id: "count",
          label: "Images",
          icon: Images,
          kind: "choice",
          group: "quick",
          options: (has(model, "Batch") ? ["1", "4", "8"] : ["1", "2", "4"]).map((n) => ({
            value: n,
            label: n === "1" ? "1 image" : `${n} images`,
          })),
          initial: "1",
        },
      );
      break;
    case "audio":
      if (isSpeech(model)) {
        controls.push(
          { id: "voice", label: "Voice", icon: Mic, kind: "choice", group: "quick", options: voices, initial: voices[0].value },
          tierControl(model, "Mode", Gauge),
        );
      } else {
        controls.push(
          {
            id: "tempo",
            label: "Tempo",
            icon: Activity,
            kind: "choice",
            group: "quick",
            options: options("Slow", "Mid", "Fast"),
            initial: "Mid",
          },
          tierControl(model, "Output", Gem),
        );
      }
      break;
    case "3d":
      controls.push(tierControl(model, "Quality", Gem), {
        id: "format",
        label: "Format",
        icon: Box,
        kind: "choice",
        group: "quick",
        options: options("GLB", "OBJ", "USDZ"),
        initial: "GLB",
      });
      break;
  }

  controls.push(seed);
  return controls.filter((c): c is Control => c !== null);
}

export function initialValues(controls: Control[]): PlaygroundValues {
  return Object.fromEntries(controls.map((c) => [c.id, c.initial]));
}

/** Merges preset values, ignoring keys or options this model doesn't offer. */
export function withValues(controls: Control[], base: PlaygroundValues, patch: PlaygroundValues): PlaygroundValues {
  const next = { ...base };
  for (const c of controls) {
    const value = patch[c.id];
    if (value === undefined) continue;
    if (c.kind === "choice" && !c.options.some((o) => o.value === value)) continue;
    next[c.id] = value;
  }
  return next;
}

export function referenceSlot(model: Model, mode: string | undefined): ReferenceSlot | null {
  const input = modeInput(mode);
  const firstLast = has(model, "First / last frame");
  if (input !== "text") {
    const label = input === "video" ? "Source video" : model.modality === "video" ? "Start frame" : "Source image";
    return { label, accept: [input], max: 1, required: true };
  }

  const accept = model.inputs.filter((m): m is "image" | "video" => m === "image" || m === "video");
  if (!accept.length) return null;
  if (firstLast) return { label: "First / last frame", accept: ["image"], max: 2, required: false };
  if (has(model, "References") || has(model, "Editing")) return { label: "References", accept, max: 4, required: false };
  return null;
}

export function promptCopy(model: Model, slot: ReferenceSlot | null) {
  if (isSpeech(model)) return { label: "Script", placeholder: "Type what the voice should say. Use tags like [warm] or [whispers]…" };
  if (slot?.required) return { label: "Prompt", placeholder: "Describe how the source should change or move…" };
  const placeholder = {
    video: "Describe the shot, the subject and how the camera moves…",
    image: "Describe the image you want to create…",
    audio: "Describe the mood, genre and instruments…",
    "3d": "Describe the object you want to model…",
  }[model.modality];
  return { label: "Prompt", placeholder };
}

export interface CostEstimate {
  total: number;
  /** Same request before the launch discount; equals `total` when there is no promo. */
  list: number;
  /** Human-readable breakdown, e.g. "5 × $0.114 per sec". */
  detail: string;
}

/** Like the API: list prices times units, the discount applied to the sum, rounded to micro-dollars at the end. */
export function estimateCost(model: Model, values: PlaygroundValues, prompt: string, references: number): CostEstimate {
  const tier = model.tiers.find((t) => t.label === values.tier);
  const listUnit = tier?.price ?? model.price;
  const unitPrice = discounted(model, listUnit);
  const rate = 1 - promoRate(model);

  let units = 1;
  let amount = "1";
  if (model.modality === "video" || model.modality === "image") {
    units = Number(model.modality === "video" ? values.duration : values.count);
    amount = `${units}`;
  } else if (isSpeech(model)) {
    const chars = prompt.trim().length;
    units = chars / 1000;
    amount = `${chars} chars`;
  }

  let list = listUnit * units;
  let detail = `${amount} × ${formatPrice(unitPrice)} per ${model.unit}`;
  if (model.inputPrice && references > 0) {
    const perRef = model.inputPrice.unit === model.unit ? units : 1;
    list += model.inputPrice.price * perRef * references;
    detail += ` + ${references} ref × ${formatPrice(roundMicros(model.inputPrice.price * perRef * rate))}`;
  }
  return { total: Math.max(0, roundMicros(list * rate)), list: roundMicros(list), detail };
}

/** Short labels describing a run's settings, for history and result captions. */
export function summarize(controls: Control[], values: PlaygroundValues) {
  return controls.flatMap((c) => {
    const value = values[c.id];
    if (c.kind === "toggle") return value ? [c.label] : [];
    if (c.kind === "seed") return value ? [`Seed ${value}`] : [];
    const option = c.options.find((o) => o.value === value);
    return option ? [option.label] : [];
  });
}

export function aspectRatio(model: Model, values: PlaygroundValues) {
  if (model.modality === "3d") return 1;
  const value = values.aspect;
  if (typeof value !== "string") return 16 / 9;
  const [w, h] = value.split(":").map(Number);
  return w / h;
}
