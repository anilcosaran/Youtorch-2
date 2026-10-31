import type { KeyStatus } from "@modelvend/admin-api/api-keys";
import type { AppCategory, AppStatus, ReleaseStatus } from "@modelvend/admin-api/apps";
import type { CreditKind, CustomerStatus, LedgerKind } from "@modelvend/admin-api/customers";
import type { BillingUnit, Disclosure, Modality, ModelState, RouteStatus, RoutingStrategy, VersionStatus, Visibility } from "@modelvend/admin-api/models";
import type { Adapter, HealthState, ProviderKind, ProviderStatus } from "@modelvend/admin-api/providers";
import type { TaskStatus } from "@modelvend/admin-api/tasks";

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
  private: "Only internal workspaces can reach it for now. Allowing other workspaces comes later.",
};

export const DISCLOSURE_LABELS: Record<Disclosure, string> = {
  open: "Open",
  white_label: "White label",
};

export const DISCLOSURE_DESCRIPTIONS: Record<Disclosure, string> = {
  open: "Customers may be shown who made it.",
  white_label: "Customers never see who made it. Only routes on providers whose terms allow it can serve it.",
};

export const VERSION_STATUS_LABELS: Record<VersionStatus, string> = {
  draft: "Draft",
  live: "Live",
  deprecated: "Deprecated",
  retired: "Retired",
};

export const VERSION_STATUS_DESCRIPTIONS: Record<VersionStatus, string> = {
  draft: "Being set up. Nobody can call it.",
  live: "Callable by customers when pinned, or by default when it is the default version.",
  deprecated: "Still answers, with Deprecation and Sunset headers. Its sunset date allows retiring it; it doesn't retire by itself.",
  retired: "No longer answers: calls get 410 version_retired, with the replacement as a suggestion. They are never forwarded.",
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
  priority: "Routes are tried in priority order; the first healthy one serves the task.",
  cheapest: "The cheapest healthy route serves the task.",
  fastest: "The route with the lowest recent p50 latency serves the task.",
  weighted: "Traffic is split by weight between healthy routes of the same priority.",
};

/** "per second", for "$0.084 per second". */
export const UNIT_LABELS: Record<BillingUnit, string> = {
  image: "image",
  megapixel: "megapixel",
  second: "second",
  minute: "minute",
  // The API's name for this unit stays `request`: one task is one unit.
  request: "task",
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
  request: "/task",
  "1k_chars": "/1K chars",
  "1m_tokens": "/1M tok",
  mesh: "/mesh",
};

export const PROVIDER_KIND_LABELS: Record<ProviderKind, string> = {
  first_party: "First party",
  managed: "Managed GPUs",
};

export const PROVIDER_KIND_DESCRIPTIONS: Record<ProviderKind, string> = {
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
  google: "Google",
  openai: "OpenAI",
  elevenlabs: "ElevenLabs",
  kling: "Kling",
  fake: "Fake, outside production only",
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

export const LEDGER_KIND_LABELS: Record<LedgerKind, string> = {
  top_up: "Top-up",
  grant: "Grant",
  usage: "Usage",
  refund: "Refund",
  adjustment: "Adjustment",
  expire: "Expired",
  fee: "Fee",
};

export const CREDIT_KIND_LABELS: Record<CreditKind, string> = {
  purchased: "Purchased, lasts 1 year",
  gift: "Gift, lasts 90 days",
};

export const KEY_STATUS_LABELS: Record<KeyStatus, string> = {
  active: "Active",
  revoked: "Revoked",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  queued: "Queued",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  canceled: "Canceled",
};
