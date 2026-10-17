import { createStore } from "./seed";
import type { Store } from "./types";

// On globalThis, so the data survives hot reloads in development.
const holder = globalThis as typeof globalThis & { __modelvendMockStore?: Store };

/** The mock's data, seeded on first use. */
export function getStore(): Store {
  holder.__modelvendMockStore ??= createStore(Date.now());
  return holder.__modelvendMockStore;
}

/** Throws away every change and seeds again, for tests. */
export function resetStore(): Store {
  holder.__modelvendMockStore = createStore(Date.now());
  return holder.__modelvendMockStore;
}
