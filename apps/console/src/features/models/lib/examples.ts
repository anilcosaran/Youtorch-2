import { galleryShots, showcaseSlides } from "@/mocks/dashboard";
import { findModel } from "@/mocks/models";
import type { Modality, Model } from "@/types/model";
import type { PlaygroundValues } from "./playground";
import { isSpeech } from "./playground";

export interface PlaygroundExample {
  id: string;
  title: string;
  prompt: string;
  image?: string;
  /** Clip length of the sample render, for video players. */
  seconds?: number;
  values: PlaygroundValues;
}

const shots = galleryShots.map((s) => ({ ...s, own: s.slug }));

/** Undefined when the model has left the catalog, which keeps its samples out of every pool. */
const modalityOf = (slug: string) => findModel(slug)?.modality;

const pools = new Map<Modality, string[]>();

/** Sample frames used as stand-in results for a modality. */
export function mediaPool(modality: Modality) {
  let pool = pools.get(modality);
  if (!pool) {
    const images = [...shots, ...showcaseSlides].filter((s) => modalityOf(s.slug) === modality).map((s) => s.image);
    pool = [...new Set(images.filter((src) => !src.endsWith(".png")))];
    pools.set(modality, pool);
  }
  return pool;
}

const audioPrompts = {
  speech: [
    { title: "Podcast intro", prompt: "[warm] Welcome back to the show. Today we go behind the scenes." },
    { title: "Bedtime story", prompt: "[soft] Once upon a time, in a quiet little village by the sea…" },
    { title: "Hype read", prompt: "[excited] You won't believe what just dropped. Let's get into it!" },
    { title: "Product walkthrough", prompt: "Here's how to set up your workspace in under two minutes." },
  ],
  music: [
    { title: "Lo-fi study", prompt: "Lo-fi beat with warm Rhodes, vinyl crackle and soft brushed drums" },
    { title: "Product reveal", prompt: "Uplifting orchestral cue that builds to a big reveal at 20 seconds" },
    { title: "Night drive", prompt: "Dark synthwave at 100 BPM with pulsing bass and airy pads" },
    { title: "Cafe morning", prompt: "Acoustic guitar and light percussion, sunny and relaxed" },
  ],
};

/** Sample results shown one at a time while the output pane is empty; the model's own showcase comes first. */
export function examplesFor(model: Model): PlaygroundExample[] {
  if (model.modality === "audio") {
    const speech = isSpeech(model);
    return audioPrompts[speech ? "speech" : "music"].map((e, i) => ({
      id: `${model.slug}-${i}`,
      ...e,
      seconds: speech ? 7 : 30,
      values: {},
    }));
  }

  return shots
    .filter((s) => modalityOf(s.slug) === model.modality)
    .sort((a, b) => Number(b.own === model.slug) - Number(a.own === model.slug))
    .slice(0, 6)
    .map((s, i): PlaygroundExample => ({
      id: `${model.slug}-${i}`,
      title: s.title,
      prompt: s.prompt,
      image: s.image,
      seconds: s.seconds,
      values: s.seconds ? { duration: `${s.seconds <= 7 ? 5 : 10}` } : {},
    }));
}
