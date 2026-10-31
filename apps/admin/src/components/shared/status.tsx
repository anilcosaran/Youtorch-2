import type { KeyStatus } from "@modelvend/admin-api/api-keys";
import type { AppStatus, ReleaseStatus } from "@modelvend/admin-api/apps";
import type { CustomerStatus } from "@modelvend/admin-api/customers";
import type { ModelState, RouteStatus, VersionStatus, Visibility } from "@modelvend/admin-api/models";
import type { HealthState, ProviderStatus } from "@modelvend/admin-api/providers";
import type { TaskStatus } from "@modelvend/admin-api/tasks";
import {
  APP_STATUS_LABELS,
  CUSTOMER_STATUS_LABELS,
  HEALTH_LABELS,
  KEY_STATUS_LABELS,
  MODEL_STATE_LABELS,
  PROVIDER_STATUS_LABELS,
  RELEASE_STATUS_LABELS,
  TASK_STATUS_LABELS,
  ROUTE_STATUS_LABELS,
  VERSION_STATUS_DESCRIPTIONS,
  VERSION_STATUS_LABELS,
  VISIBILITY_DESCRIPTIONS,
  VISIBILITY_LABELS,
} from "@/lib/labels";
import { Pill, type Tone } from "./pill";

const MODEL_STATE_TONES: Record<ModelState, Tone> = { active: "good", paused: "critical" };

export function ModelStatePill({ state }: { state: ModelState }) {
  return <Pill tone={MODEL_STATE_TONES[state]}>{MODEL_STATE_LABELS[state]}</Pill>;
}

const VISIBILITY_TONES: Record<Visibility, Tone> = { public: "info", unlisted: "neutral", private: "warning" };

export function VisibilityPill({ visibility }: { visibility: Visibility }) {
  return (
    <Pill tone={VISIBILITY_TONES[visibility]} title={VISIBILITY_DESCRIPTIONS[visibility]}>
      {VISIBILITY_LABELS[visibility]}
    </Pill>
  );
}

const VERSION_TONES: Record<VersionStatus, Tone> = {
  draft: "neutral",
  live: "good",
  deprecated: "warning",
  retired: "critical",
};

export function VersionStatusPill({ status }: { status: VersionStatus }) {
  return (
    <Pill tone={VERSION_TONES[status]} title={VERSION_STATUS_DESCRIPTIONS[status]}>
      {VERSION_STATUS_LABELS[status]}
    </Pill>
  );
}

const ROUTE_TONES: Record<RouteStatus, Tone> = { active: "good", paused: "critical", draining: "warning" };

export function RouteStatusPill({ status }: { status: RouteStatus }) {
  return <Pill tone={ROUTE_TONES[status]}>{ROUTE_STATUS_LABELS[status]}</Pill>;
}

const PROVIDER_TONES: Record<ProviderStatus, Tone> = { active: "good", paused: "critical", disabled: "neutral" };

export function ProviderStatusPill({ status }: { status: ProviderStatus }) {
  return <Pill tone={PROVIDER_TONES[status]}>{PROVIDER_STATUS_LABELS[status]}</Pill>;
}

const HEALTH_TONES: Record<HealthState, Tone> = { operational: "good", degraded: "warning", outage: "critical" };

export function HealthPill({ state }: { state: HealthState }) {
  return <Pill tone={HEALTH_TONES[state]}>{HEALTH_LABELS[state]}</Pill>;
}

const APP_TONES: Record<AppStatus, Tone> = { draft: "neutral", live: "good", paused: "critical" };

export function AppStatusPill({ status }: { status: AppStatus }) {
  return <Pill tone={APP_TONES[status]}>{APP_STATUS_LABELS[status]}</Pill>;
}

const RELEASE_TONES: Record<ReleaseStatus, Tone> = { draft: "info", live: "good", superseded: "neutral" };

export function ReleaseStatusPill({ status }: { status: ReleaseStatus }) {
  return <Pill tone={RELEASE_TONES[status]}>{RELEASE_STATUS_LABELS[status]}</Pill>;
}

const CUSTOMER_TONES: Record<CustomerStatus, Tone> = { active: "good", suspended: "critical" };

export function CustomerStatusPill({ status }: { status: CustomerStatus }) {
  return <Pill tone={CUSTOMER_TONES[status]}>{CUSTOMER_STATUS_LABELS[status]}</Pill>;
}

const KEY_TONES: Record<KeyStatus, Tone> = { active: "good", revoked: "neutral" };

export function KeyStatusPill({ status }: { status: KeyStatus }) {
  return <Pill tone={KEY_TONES[status]}>{KEY_STATUS_LABELS[status]}</Pill>;
}

const TASK_TONES: Record<TaskStatus, Tone> = {
  queued: "neutral",
  running: "info",
  succeeded: "good",
  failed: "critical",
  canceled: "neutral",
};

export function TaskStatusPill({ status }: { status: TaskStatus }) {
  return <Pill tone={TASK_TONES[status]}>{TASK_STATUS_LABELS[status]}</Pill>;
}
