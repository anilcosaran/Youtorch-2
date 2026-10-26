export type Modality = "video" | "image" | "audio" | "3d";

export type Medium = "text" | "image" | "video" | "audio" | "3d";

export type ArtPattern = "orb" | "aurora" | "dunes" | "horizon" | "rings" | "prism";

export type ModelTag = "new" | "trending" | "original";

/**
 * How open a model is about where it comes from. `open` models name their author and list their providers;
 * `white_label` models never show either, anywhere.
 */
export type Disclosure = "open" | "white_label";

export interface PriceTier {
  label: string;
  price: number;
}

/** A launch discount on every price of the model, through the last day of the offer. */
export interface Promo {
  /** Fraction off list prices, between 0 and 1. */
  discount: number;
  /** Last day of the offer, as an ISO date (UTC). */
  until: string;
}

export interface Model {
  /** Namespace of the model ID, e.g. `google` in `google/veo-3.1`. Ours, not necessarily the maker. */
  publisher: string;
  slug: string;
  name: string;
  disclosure: Disclosure;
  /** Who made the model, shown only for open models. */
  author?: string;
  modality: Modality;
  description: string;
  /** List price of one output unit at the default tier. */
  price: number;
  unit: string;
  /** What one unit means, e.g. "1080p" or "1024×1024". */
  unitDetail?: string;
  /** Charged per input when the model bills for references or source media. */
  inputPrice?: { price: number; unit: string };
  /** Output price by resolution or quality; includes the default tier. */
  tiers: PriceTier[];
  /** Only present while the offer runs. */
  promo?: Promo;
  inputs: Medium[];
  outputs: Medium[];
  maxOutput: string;
  latency: string;
  capabilities: string[];
  tags?: ModelTag[];
  art: { pattern: ArtPattern; colors: [string, string, string] };
}

export type Status = "ok" | "degraded" | "down";

/** One provider serving an open model. Every provider bills the model's own price. */
export interface ModelProvider {
  id: string;
  name: string;
  /** The provider's region, as the provider names it. */
  region: string;
  latency: { p50: number; p90: number; p99: number };
  uptime: number;
  /** Uptime for each of the last six hours, newest last. */
  recent: number[];
  /** Daily status for the last 45 days, newest last. */
  history: Status[];
}

export interface ModelStats {
  released: string;
  /** Empty for white-label models, which never name their providers. */
  providers: ModelProvider[];
  latency: { label: string; date: string; value: number }[];
  /** Daily status of the model as a whole for the last 45 days, newest last. */
  uptime: Status[];
  uptimePct: number;
}
