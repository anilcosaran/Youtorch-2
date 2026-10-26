import type { KeyEnv } from "@modelvend/admin-api/api-keys";
import type { Tier } from "@modelvend/admin-api/customers";
import { createRandom, hashSeed, type Random } from "../random";
import type { ApiKeyRecord, AppRecord, CustomerRecord, ModelRecord } from "../types";
import { DAY, HOUR, MINUTE, iso, money } from "../util";
import type { SeedEvent } from "./audit";

const KEY_COUNT: Record<Tier, [number, number]> = {
  free: [1, 1],
  standard: [1, 4],
  scale: [2, 4],
  enterprise: [4, 7],
};

const LIVE_NAMES = ["Backend", "Render workers", "Batch pipeline", "Mobile app", "Zapier", "Website", "Agency portal", "Data team"];
const TEST_NAMES = ["Staging", "Local dev", "CI", "Preview deploys"];

const OPERATOR_REVOCATIONS = [
  { reason: "Leaked in a public GitHub repository; found by secret scanning.", by: "op_deniz" },
  { reason: "The customer asked support to revoke it after an employee left.", by: "op_deniz" },
  { reason: "Used from an unexpected network; the customer confirmed it was compromised.", by: "op_anil" },
];

/** Customers' API keys, newest first. Spend and requests split each customer's month across their keys. */
export function seedApiKeys(
  now: number,
  customers: CustomerRecord[],
  models: ModelRecord[],
  apps: AppRecord[],
): { apiKeys: ApiKeyRecord[]; events: SeedEvent[] } {
  const events: SeedEvent[] = [];
  const prefixes = new Set<string>();
  const prefix = (random: Random, env: KeyEnv) => {
    let value: string;
    do value = `mv_${env}_${random.hex(4)}`;
    while (prefixes.has(value));
    prefixes.add(value);
    return value;
  };
  const scopeChoices = [...models.filter((m) => m.defaultVersion).map((m) => m.id), ...apps.map((a) => a.slug)];
  let revocations = 0;

  const apiKeys = customers.flatMap((customer) => {
    const random = createRandom(hashSeed(`keys:${customer.id}`));
    const created = Date.parse(customer.createdAt);
    const count = random.int(...KEY_COUNT[customer.tier]);
    const keys = Array.from({ length: count }, (_, index): ApiKeyRecord => {
      const random = createRandom(hashSeed(`key:${customer.id}:${index}`));
      const id = random.id("key_", 12);
      const first = index === 0;
      const env: KeyEnv = first || random.chance(0.65) ? "live" : "test";
      const name = first ? "Production" : random.pick(env === "live" ? LIVE_NAMES : TEST_NAMES);
      const createdAt = first ? created + 10 * MINUTE : random.int(created + HOUR, now - HOUR);
      const revoked = !first && random.chance(0.18);
      const revokedAt = revoked ? random.int(Math.max(createdAt + DAY, now - 40 * DAY), now - HOUR) : null;
      const operator = revoked && revocations % 3 === 0 ? OPERATOR_REVOCATIONS[(revocations / 3) % OPERATOR_REVOCATIONS.length] : null;
      if (revoked) revocations++;
      const lastActive = customer.lastActiveAt ? Date.parse(customer.lastActiveAt) : null;
      const lastUsed =
        lastActive === null
          ? null
          : revokedAt !== null
            ? Math.min(revokedAt - random.int(1, 48) * HOUR, lastActive)
            : env === "test"
              ? Math.max(createdAt, lastActive - random.int(1, 9) * DAY)
              : first
                ? lastActive
                : Math.max(createdAt, lastActive - random.int(0, 30) * HOUR);
      const keyPrefix = prefix(random, env);
      if (operator && revokedAt !== null) {
        events.push({
          at: revokedAt,
          operatorId: operator.by,
          action: "api_key.revoke",
          targetType: "api_key",
          targetId: id,
          detail: { prefix: keyPrefix, customerId: customer.id, reason: operator.reason },
        });
      }
      return {
        id,
        name,
        prefix: keyPrefix,
        env,
        status: revoked ? "revoked" : "active",
        customerId: customer.id,
        scopes: !first && random.chance(0.2) ? random.sample(scopeChoices, random.int(1, 3)) : [],
        spendLimit: !first && env === "live" && random.chance(0.3) ? random.pick([50, 100, 250, 500, 1000, 2500]) : null,
        spend30d: 0,
        requests30d: 0,
        createdAt: iso(createdAt),
        lastUsedAt: lastUsed === null || lastUsed < createdAt ? null : iso(lastUsed),
        revokedAt: revokedAt === null ? null : iso(revokedAt),
        revokedReason: revoked ? (operator?.reason ?? "Revoked by the customer.") : null,
      };
    });

    // Split the month across keys that could have been used in it.
    const weights = keys.map((key, index) => {
      if (key.revokedAt && Date.parse(key.revokedAt) < now - 30 * DAY) return 0;
      if (key.env === "test") return random.float(0.01, 0.04);
      return index === 0 ? 1 : random.float(0.2, 0.8);
    });
    const total = weights.reduce((a, b) => a + b, 0);
    keys.forEach((key, index) => {
      const share = total > 0 ? weights[index] / total : 0;
      key.requests30d = Math.round(customer.requests30d * share);
      key.spend30d = money(customer.spend30d * share);
    });
    return keys;
  });

  apiKeys.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { apiKeys, events };
}
