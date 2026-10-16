import type { AUDIT_ACTIONS, AuditEntry } from "@/lib/api/audit";
import type { Random } from "../random";
import type { AppRecord, ModelRecord, OperatorRecord, ProviderRecord } from "../types";
import { DAY, HOUR, MINUTE, iso } from "../util";

/** An audit entry from a seed module, before IDs and operator names are filled in. */
export interface SeedEvent {
  at: number;
  operatorId: string | null;
  action: (typeof AUDIT_ACTIONS)[number];
  targetType: string;
  targetId: string | null;
  detail: Record<string, unknown>;
}

/** Office and home addresses from the documentation ranges. */
const IPS: Record<string, string> = {
  op_anil: "203.0.113.24",
  op_mara: "198.51.100.71",
  op_deniz: "203.0.113.90",
  op_jonas: "198.51.100.12",
};

const WINDOW = 30 * DAY;

/** Catalog changes in the last 30 days, read back from the seeded versions and routes. */
function catalogEvents(now: number, models: ModelRecord[], operatorByName: (name: string | null) => string | null): SeedEvent[] {
  const events: SeedEvent[] = [];
  const recent = (at: string | null): at is string => at !== null && Date.parse(at) > now - WINDOW;
  for (const model of models) {
    if (recent(model.createdAt)) {
      const by = operatorByName(model.versionList[0]?.createdBy ?? null);
      events.push({ at: Date.parse(model.createdAt), operatorId: by, action: "model.create", targetType: "model", targetId: model.id, detail: { name: model.name, modality: model.modality } });
    }
    if (model.state === "paused" && model.pausedReason) {
      events.push({ at: Date.parse(model.updatedAt), operatorId: "op_mara", action: "model.pause", targetType: "model", targetId: model.id, detail: { reason: model.pausedReason } });
    }
    if (model.featured) {
      events.push({ at: now - 26 * DAY + model.name.length * HOUR, operatorId: "op_anil", action: "model.update", targetType: "model", targetId: model.id, detail: { featured: { from: false, to: true } } });
    }
    for (const version of model.versionList) {
      const target = `${model.id}@${version.id}`;
      const by = operatorByName(version.createdBy);
      if (recent(version.createdAt)) {
        events.push({ at: Date.parse(version.createdAt), operatorId: by, action: "version.create", targetType: "version", targetId: target, detail: { label: version.label } });
        if (version.status === "staging") {
          events.push({ at: Date.parse(version.createdAt) + 20 * HOUR, operatorId: by, action: "version.promote", targetType: "version", targetId: target, detail: { from: "draft", to: "staging" } });
        }
      }
      if (recent(version.releasedAt)) {
        const at = Date.parse(version.releasedAt);
        events.push({ at, operatorId: by, action: "version.promote", targetType: "version", targetId: target, detail: { from: "staging", to: "live" } });
        if (version.isDefault) {
          const previous = model.versionList.find((v) => v.replacement === version.id && v.status === "deprecated");
          events.push({ at: at + 30 * MINUTE, operatorId: by, action: "version.default", targetType: "version", targetId: target, detail: { from: previous?.id ?? null, to: version.id } });
        }
      }
      if (recent(version.deprecatedAt)) {
        events.push({
          at: Date.parse(version.deprecatedAt),
          operatorId: by,
          action: "version.deprecate",
          targetType: "version",
          targetId: target,
          detail: { sunsetAt: version.sunsetAt, replacement: version.replacement },
        });
      }
      for (const route of version.routes) {
        if (route.status !== "active" && version.status !== "retired" && recent(route.updatedAt)) {
          events.push({
            at: Date.parse(route.updatedAt),
            operatorId: "op_mara",
            action: "route.update",
            targetType: "route",
            targetId: `${target}/${route.id}`,
            detail: {
              status: { from: "active", to: route.status },
              reason: route.status === "draining" ? "Moving traffic off Replicate before the contract ends." : "Provider returning 5xx on long scripts.",
            },
          });
        }
      }
    }
  }
  return events;
}

function appEvents(now: number, apps: AppRecord[], operatorByName: (name: string | null) => string | null): SeedEvent[] {
  const events: SeedEvent[] = [];
  for (const app of apps) {
    for (const release of app.releases) {
      const by = operatorByName(release.createdBy);
      // Published releases show their publish; drafts show their creation.
      if (release.status === "draft" && Date.parse(release.createdAt) > now - WINDOW) {
        events.push({ at: Date.parse(release.createdAt), operatorId: by, action: "app.release.create", targetType: "app", targetId: app.slug, detail: { release: release.number } });
      }
      if (release.publishedAt && Date.parse(release.publishedAt) > now - WINDOW) {
        events.push({ at: Date.parse(release.publishedAt), operatorId: by, action: "app.release.publish", targetType: "app", targetId: app.slug, detail: { release: release.number, price: release.price } });
      }
    }
    if (app.status === "paused") {
      events.push({ at: Date.parse(app.updatedAt), operatorId: "op_anil", action: "app.pause", targetType: "app", targetId: app.slug, detail: { reason: app.pausedReason } });
    }
  }
  const draftApp = apps.find((app) => app.status === "draft");
  if (draftApp) {
    events.push({ at: Date.parse(draftApp.releases[0].createdAt) - MINUTE, operatorId: "op_mara", action: "app.create", targetType: "app", targetId: draftApp.slug, detail: { name: draftApp.name } });
  }
  return events;
}

function providerEvents(now: number, providers: ProviderRecord[]): SeedEvent[] {
  const events: SeedEvent[] = [];
  for (const provider of providers) {
    const created = Date.parse(provider.createdAt);
    if (created > now - WINDOW) {
      events.push({ at: created, operatorId: "op_anil", action: "provider.create", targetType: "provider", targetId: provider.id, detail: { name: provider.name, kind: provider.kind } });
    }
    const rotated = provider.credential.rotatedAt ? Date.parse(provider.credential.rotatedAt) : null;
    if (rotated !== null && provider.credential.source === "console" && rotated > now - WINDOW) {
      events.push({ at: rotated + MINUTE, operatorId: "op_anil", action: "provider.credential", targetType: "provider", targetId: provider.id, detail: { hint: provider.credential.hint } });
    }
  }
  events.push({
    at: now - 6 * DAY - 3 * HOUR,
    operatorId: "op_mara",
    action: "provider.update",
    targetType: "provider",
    targetId: "byteplus",
    detail: { limits: { from: { concurrency: 80, requestsPerMinute: 2000 }, to: { concurrency: 120, requestsPerMinute: 2000 } } },
  });
  return events;
}

function operatorEvents(now: number, random: Random, operators: OperatorRecord[]): SeedEvent[] {
  const events: SeedEvent[] = [
    { at: now - 28 * DAY, operatorId: "op_anil", action: "operator.create", targetType: "operator", targetId: "op_jonas", detail: { email: "jonas@modelvend.ai", role: "custom" } },
    { at: now - 8 * DAY - 2 * HOUR, operatorId: "op_anil", action: "operator.update", targetType: "operator", targetId: "op_jonas", detail: { disabled: { from: false, to: true }, reason: "Contract ended." } },
    { at: now - 22 * DAY, operatorId: "op_anil", action: "operator.update", targetType: "operator", targetId: "op_mara", detail: { permissions: { added: ["providers.edit"] } } },
    { at: now - 17 * DAY, operatorId: "op_anil", action: "operator.reset_password", targetType: "operator", targetId: "op_deniz", detail: { generated: true } },
    { at: now - 17 * DAY + 20 * MINUTE, operatorId: "op_deniz", action: "auth.password", targetType: "operator", targetId: "op_deniz", detail: {} },
    { at: now - 9 * DAY, operatorId: null, action: "auth.login_failed", targetType: "operator", targetId: null, detail: { email: "admin@modelvend.ai", reason: "unknown_email" } },
    { at: now - 7 * DAY, operatorId: null, action: "auth.login_failed", targetType: "operator", targetId: "op_jonas", detail: { email: "jonas@modelvend.ai", reason: "disabled" } },
    { at: now - 3 * DAY, operatorId: null, action: "auth.login_failed", targetType: "operator", targetId: "op_mara", detail: { email: "mara@modelvend.ai", reason: "wrong_password" } },
  ];
  const sessions: [string, number][] = [
    ["op_anil", 5],
    ["op_mara", 4],
    ["op_deniz", 3],
    ["op_jonas", 2],
  ];
  for (const [id, count] of sessions) {
    const operator = operators.find((o) => o.id === id);
    if (!operator) continue;
    const latest = operator.lastLoginAt ? Date.parse(operator.lastLoginAt) : now;
    for (let i = 0; i < count; i++) {
      const at = i === 0 ? latest : latest - random.int(i * 2, i * 3 + 1) * DAY - random.int(0, 10) * HOUR;
      if (at < now - WINDOW) continue;
      events.push({ at, operatorId: id, action: "auth.login", targetType: "operator", targetId: id, detail: {} });
      if (i > 0 && random.chance(0.35)) {
        events.push({ at: at + random.int(2, 9) * HOUR, operatorId: id, action: "auth.logout", targetType: "operator", targetId: id, detail: {} });
      }
    }
  }
  return events;
}

/** About 80 entries over the last 30 days, newest first. */
export function seedAudit(
  now: number,
  random: Random,
  data: { operators: OperatorRecord[]; models: ModelRecord[]; apps: AppRecord[]; providers: ProviderRecord[]; events: SeedEvent[] },
): AuditEntry[] {
  const { operators } = data;
  const operatorByName = (name: string | null) => operators.find((o) => o.name === name)?.id ?? null;
  const events = [
    ...catalogEvents(now, data.models, operatorByName),
    ...appEvents(now, data.apps, operatorByName),
    ...providerEvents(now, data.providers),
    ...operatorEvents(now, random, operators),
    ...data.events,
  ];
  return events
    .filter((event) => event.at > now - WINDOW && event.at <= now)
    .sort((a, b) => b.at - a.at)
    .map((event) => {
      const operator = operators.find((o) => o.id === event.operatorId) ?? null;
      return {
        id: random.id("aud_", 12),
        operator: operator ? { id: operator.id, name: operator.name } : null,
        action: event.action,
        targetType: event.targetType,
        targetId: event.targetId,
        detail: event.detail,
        ip: event.operatorId ? IPS[event.operatorId] ?? null : "192.0.2.45",
        at: iso(event.at),
      };
    });
}
