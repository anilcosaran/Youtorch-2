export type Modality = "video" | "image" | "audio" | "3d";

export type Medium = "text" | "image" | "video" | "audio" | "3d";

export type ArtPattern = "orb" | "aurora" | "dunes" | "horizon" | "rings" | "prism";

export type ModelTag = "new" | "trending" | "original";

export interface PriceTier {
  label: string;
  price: number;
}

export interface Model {
  slug: string;
  name: string;
  provider: string;
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
  /** Fractional launch discount applied on top of list prices. */
  promo?: number;
  inputs: Medium[];
  outputs: Medium[];
  maxOutput: string;
  latency: string;
  capabilities: string[];
  tags?: ModelTag[];
  art: { pattern: ArtPattern; colors: [string, string, string] };
}

export type Region = "global" | "eu" | "us" | "apac" | "sa";

export type EndpointKind = "direct" | "edge" | "spot";

export type Status = "ok" | "degraded" | "down";

export interface Endpoint {
  id: string;
  host: string;
  kind: EndpointKind;
  region: Region;
  location: string;
  listPrice: number;
  price: number;
  /** Fast low-res preview tier; null when the endpoint doesn't offer it. */
  draftPrice: number | null;
  latency: { p50: number; p90: number; p99: number };
  throughput: number;
  uptime: number;
  /** Uptime for each of the last six hours, newest last. */
  recent: number[];
  /** Daily status for the last 45 days, newest last. */
  history: Status[];
}

export interface ModelStats {
  released: string;
  endpoints: Endpoint[];
  latency: { label: string; date: string; value: number }[];
  uptime: Status[];
  uptimePct: number;
  effective: number;
}
