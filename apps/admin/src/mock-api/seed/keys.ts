import { createRandom, hashSeed, type Random } from "../random";
import type { ApiKeyRecord, AppRecord, CustomerRecord, ModelRecord } from "../types";
import { DAY, HOUR, MINUTE, iso, toMicros } from "../util";
import type { SeedEvent } from "./audit";

const NAMES = ["Backend", "Render workers", "Batch pipeline", "Mobile app", "Zapier", "Website", "Agency portal", "Data team", "Local dev", "CI"];

const OPERATOR_REVOCATIONS = [
  { reason: "Leaked in a public GitHub repository; found by secret scanning.", by: "op_deniz" },
  { reason: "The customer asked support to revoke it after an employee left.", by: "op_deniz" },
  { reason: "Used from an unexpected network; the customer confirmed it was compromised.", by: "op_anil" },
];

/** Customers' API keys, newest first. Spend and tasks split each customer's month across their keys. */
export function seedApiKeys(
  now: number,
  customers: CustomerRecord[],
  models: ModelRecord[],
  apps: AppRecord[],
): { apiKeys: ApiKeyRecord[]; events: SeedEvent[] } {
  const events: SeedEvent[] = [];
  const prefixes = new Set<string>();
  const prefix = (random: Random) => {
    let value: string;
    do value = `mv_${random.hex(8)}`;
    while (prefixes.has(value));
    prefixes.add(value);
    return value;
  };
  const scopeChoices = [...models.filter((m) => m.defaultVersion).map((m) => m.id), ...apps.map((a) => a.slug)];
  let revocations = 0;

  const apiKeys = customers.flatMap((customer) => {
    const random = createRandom(hashSeed(`keys:${customer.id}`));
    const created = Date.parse(customer.createdAt);
    // Busier customers run more keys.
    const count = customer.tasks30d > 40_000 ? random.int(4, 7) : customer.tasks30d > 300 ? random.int(1, 4) : 1;
    const keys = Array.from({ length: count }, (_, index): ApiKeyRecord => {
      const random = createRandom(hashSeed(`key:${customer.id}:${index}`));
      const id = random.id("key_", 12);
      const first = index === 0;
      const name = first ? "Production" : random.pick(NAMES);
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
            : first
              ? lastActive
              : Math.max(createdAt, lastActive - random.int(0, 30) * HOUR);
      const keyPrefix = prefix(random);
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
        status: revoked ? "revoked" : "active",
        customerId: customer.id,
        createdBy: { id: customer.owner.id, name: customer.owner.name },
        scopes: !first && random.chance(0.2) ? random.sample(scopeChoices, random.int(1, 3)) : [],
        spendLimitMicros: !first && random.chance(0.3) ? toMicros(random.pick([50, 100, 250, 500, 1000, 2500])) : null,
        spend30dMicros: 0,
        tasks30d: 0,
        createdAt: iso(createdAt),
        lastUsedAt: lastUsed === null || lastUsed < createdAt ? null : iso(lastUsed),
        revokedAt: revokedAt === null ? null : iso(revokedAt),
        revokedReason: revoked ? (operator?.reason ?? "Revoked by the customer.") : null,
      };
    });

    // Split the month across keys that could have been used in it.
    const weights = keys.map((key, index) => {
      if (key.revokedAt && Date.parse(key.revokedAt) < now - 30 * DAY) return 0;
      return index === 0 ? 1 : random.float(0.2, 0.8);
    });
    const total = weights.reduce((a, b) => a + b, 0);
    keys.forEach((key, index) => {
      const share = total > 0 ? weights[index] / total : 0;
      key.tasks30d = Math.round(customer.tasks30d * share);
      key.spend30dMicros = Math.round(customer.spend30dMicros * share);
    });
    return keys;
  });

  apiKeys.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { apiKeys, events };
}
