import type { TaskInput } from "@/components/code/snippets";
import type { Model } from "@/types/model";
import { examplesFor } from "./examples";
import { isSpeech } from "./playground";

/** A minimal `input` for the model's API example; everything left out takes the schema's default. */
export function apiExample(model: Model): TaskInput {
  const prompt = examplesFor(model)[0]?.prompt;
  if (isSpeech(model)) return { text: prompt ?? "Welcome back to the show." };
  switch (model.modality) {
    case "video":
      return { prompt: prompt ?? "A paper boat drifting through a neon-lit canal at night", aspect_ratio: "16:9" };
    case "image":
      return { prompt: prompt ?? "A faceted perfume bottle in a swirl of amber liquid", num_images: 1 };
    case "audio":
      return { prompt: prompt ?? "Lo-fi beat with warm Rhodes and soft brushed drums" };
    case "3d":
      return { prompt: prompt ?? "Low-poly terracotta fox on a turntable" };
  }
}
