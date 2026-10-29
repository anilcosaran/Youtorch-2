import { site } from "@/config/site";
import type { Model } from "@/types/model";

/** The ID the API takes, e.g. `google/veo-3.1`. */
export function modelId(model: Pick<Model, "publisher" | "slug">) {
  return `${model.publisher}/${model.slug}`;
}

/** Who to credit for a model: its author when it's open, otherwise us. */
export function madeBy(model: Model) {
  return model.disclosure === "open" && model.author ? model.author : site.name;
}
