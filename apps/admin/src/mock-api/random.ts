/** A seeded pseudo-random generator, so every store starts from the same data. */
export interface Random {
  /** A float in [0, 1). */
  next(): number;
  /** An integer in [min, max]. */
  int(min: number, max: number): number;
  float(min: number, max: number): number;
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** One item, more likely the heavier its weight. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T;
  shuffle<T>(items: readonly T[]): T[];
  /** `count` distinct items. */
  sample<T>(items: readonly T[], count: number): T[];
  /** `prefix` plus random lowercase letters and digits, e.g. `req_8k2m9q4t`. */
  id(prefix: string, length?: number): string;
  hex(length: number): string;
}

const ID_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

/** Mulberry32: small, fast and good enough for sample data. */
export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)];
  const chars = (alphabet: string, length: number) => {
    let out = "";
    for (let i = 0; i < length; i++) out += alphabet[Math.floor(next() * alphabet.length)];
    return out;
  };
  const shuffle = <T>(items: readonly T[]): T[] => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  return {
    next,
    int,
    float: (min, max) => min + next() * (max - min),
    chance: (probability) => next() < probability,
    pick,
    weighted(items, weight) {
      const total = items.reduce((acc, item) => acc + Math.max(0, weight(item)), 0);
      let roll = next() * total;
      for (const item of items) {
        roll -= Math.max(0, weight(item));
        if (roll < 0) return item;
      }
      return items[items.length - 1];
    },
    shuffle,
    sample: (items, count) => shuffle(items).slice(0, count),
    id: (prefix, length = 10) => `${prefix}${chars(ID_ALPHABET, length)}`,
    hex: (length) => chars("0123456789abcdef", length),
  };
}

/** FNV-1a: a stable 32-bit seed from a string. */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
