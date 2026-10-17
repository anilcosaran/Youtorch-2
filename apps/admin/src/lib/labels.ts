import type { KeyEnv, KeyStatus } from "./api/api-keys";
import type { AppCategory, AppStatus, ReleaseStatus } from "./api/apps";
import type { CustomerStatus, LedgerKind, Tier } from "./api/customers";
import type { BillingUnit, Modality, ModelState, RouteStatus, RoutingStrategy, VersionStatus, Visibility } from "./api/models";
import type { Adapter, HealthState, ProviderKind, ProviderStatus } from "./api/providers";
import type { RequestStatus } from "./api/requests";

export const MODALITY_LABELS: Record<Modality, string> = {
  image: "Image",
  video: "Video",
  audio: "Audio",
  "3d": "3D",
  text: "Text",
};

export const MODEL_STATE_LABELS: Record<ModelState, string> = {
  active: "Active",
  paused: "Paused",
};

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  public: "Public",
  unlisted: "Unlisted",
  private: "Private",
};

export const VISIBILITY_DESCRIPTIONS: Record<Visibility, string> = {
  public: "Listed in the catalog and callable by every workspace.",
  unlisted: "Callable by every workspace, but not listed in the catalog.",
  private: "Callable only by allowlisted workspaces and internal keys.",
};

export const VERSION_STATUS_LABELS: Record<VersionStatus, string> = {
  draft: "Draft",
  staging: "Staging",
  live: "Live",
  deprecated: "Deprecated",
  retired: "Retired",
};

export const VERSION_STATUS_DESCRIPTIONS: Record<VersionStatus, string> = {
  draft: "Being set up. Nobody can call it.",
  staging: "Callable with internal keys only, for testing routes and schema.",
  live: "Callable by customers when pinned, or by default when it is the default version.",
  deprecated: "Still answers, with Deprecation and Sunset headers, until its sunset date.",
  retired: "No longer answers: requests get 410, or go to its replacement.",
};

export const ROUTE_STATUS_LABELS: Record<RouteStatus, string> = {
  active: "Active",
  paused: "Paused",
  draining: "Draining",
};

export const STRATEGY_LABELS: Record<RoutingStrategy, string> = {
  priority: "Priority order",
  cheapest: "Cheapest first",
  fastest: "Fastest first",
  weighted: "Weighted split",
};

export const STRATEGY_DESCRIPTIONS: Record<RoutingStrategy, string> = {
  priority: "Routes are tried in priority order; the first healthy one serves the request.",
  cheapest: "The cheapest healthy route serves the request.",
  fastest: "The route with the lowest recent p50 latency serves the request.",
  weighted: "Traffic is split by weight between healthy routes of the same priority.",
};

/** "per second", for "$0.084 per second". */
export const UNIT_LABELS: Record<BillingUnit, string> = {
  image: "image",
  megapixel: "megapixel",
  second: "second",
  minute: "minute",
  request: "request",
  "1k_chars": "1K characters",
  "1m_tokens": "1M tokens",
  mesh: "mesh",
};

/** "/s", for "$0.084/s" in tight cells. */
export const UNIT_SHORT: Record<BillingUnit, string> = {
  image: "/img",
  megapixel: "/MP",
  second: "/s",
  minute: "/min",
  request: "/req",
  "1k_chars": "/1K chars",
  "1m_tokens": "/1M tok",
  mesh: "/mesh",
};

export const PROVIDER_KIND_LABELS: Record<ProviderKind, string> = {
  aggregator: "Aggregator",
  first_party: "First party",
  managed: "Managed GPUs",
};

export const PROVIDER_KIND_DESCRIPTIONS: Record<ProviderKind, string> = {
  aggregator: "Resells many labs' models behind one API, e.g. fal or Replicate.",
  first_party: "The lab's own API, e.g. OpenAI or Google.",
  managed: "Capacity we run ourselves.",
};

export const PROVIDER_STATUS_LABELS: Record<ProviderStatus, string> = {
  active: "Active",
  paused: "Paused",
  disabled: "Disabled",
};

export const HEALTH_LABELS: Record<HealthState, string> = {
  operational: "Operational",
  degraded: "Degraded",
  outage: "Outage",
};

export const ADAPTER_LABELS: Record<Adapter, string> = {
  fal: "fal queue",
  replicate: "Replicate predictions",
  openai: "OpenAI compatible",
  vertex: "Google Vertex AI",
  elevenlabs: "ElevenLabs",
  runway: "Runway",
  http: "Generic HTTP",
};

export const APP_STATUS_LABELS: Record<AppStatus, string> = {
  draft: "Draft",
  live: "Live",
  paused: "Paused",
};

export const RELEASE_STATUS_LABELS: Record<ReleaseStatus, string> = {
  draft: "Draft",
  live: "Live",
  superseded: "Superseded",
};

export const APP_CATEGORY_LABELS: Record<AppCategory, string> = {
  image: "Image",
  video: "Video",
  audio: "Audio",
  "3d": "3D",
};

export const CUSTOMER_STATUS_LABELS: Record<CustomerStatus, string> = {
  active: "Active",
  suspended: "Suspended",
};

export const TIER_LABELS: Record<Tier, string> = {
  free: "Free",
  standard: "Standard",
  scale: "Scale",
  enterprise: "Enterprise",
};

export const LEDGER_KIND_LABELS: Record<LedgerKind, string> = {
  top_up: "Top-up",
  grant: "Grant",
  usage: "Usage",
  refund: "Refund",
  adjustment: "Adjustment",
};

export const KEY_ENV_LABELS: Record<KeyEnv, string> = {
  live: "Live",
  test: "Test",
};

export const KEY_STATUS_LABELS: Record<KeyStatus, string> = {
  active: "Active",
  revoked: "Revoked",
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  queued: "Queued",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  canceled: "Canceled",
};
