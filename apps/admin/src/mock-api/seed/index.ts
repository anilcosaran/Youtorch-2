import { createRandom, hashSeed } from "../random";
import { seedPassword } from "../session";
import type { Store } from "../types";
import { seedApps } from "./apps";
import { seedAudit } from "./audit";
import { providerCost30d, seedCatalog } from "./catalog";
import { seedCustomers } from "./customers";
import { seedApiKeys } from "./keys";
import { seedOperators } from "./operators";
import { seedProviders } from "./providers";
import { seedRequests } from "./requests";

/** The same seed gives the same IDs and data on every start. */
const SEED = 20261016;

/** One generator per area, so a change in one doesn't shift the IDs of the next. */
const stream = (area: string) => createRandom(hashSeed(`${SEED}:${area}`));

/** A fresh store with seeded data; every seeded time is relative to `now`. */
export function createStore(now: number): Store {
  const operators = seedOperators(now, seedPassword());
  const providers = seedProviders(now);
  const models = seedCatalog(now, stream("catalog"), providers);
  for (const provider of providers) provider.cost30d = providerCost30d(models, provider.id);
  const apps = seedApps(now, stream("apps"));
  const customerSeed = seedCustomers(now, stream("customers"), models);
  const keySeed = seedApiKeys(now, customerSeed.customers, models, apps);
  const requestSeed = seedRequests(now, stream("requests"), {
    models,
    providers,
    customers: customerSeed.customers,
    apiKeys: keySeed.apiKeys,
    apps,
  });
  const audit = seedAudit(now, stream("audit"), {
    operators,
    models,
    apps,
    providers,
    events: [...customerSeed.events, ...keySeed.events, ...requestSeed.events],
  });
  return {
    createdAt: now,
    random: stream("runtime"),
    operators,
    audit,
    providers,
    models,
    apps,
    customers: customerSeed.customers,
    apiKeys: keySeed.apiKeys,
    requests: requestSeed.requests,
    loginFailures: new Map(),
    endedSessions: new Map(),
  };
}
