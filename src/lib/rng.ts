// Mulberry32: deterministic 32-bit PRNG. Persisted as the integer state.
// All randomness in a run derives from the run seed so that turns are
// reproducible and auditable on the server.

export type RngState = { s: number };

export function rngFromSeed(seed: number): RngState {
  return { s: seed >>> 0 };
}

export function rngFromString(str: string): RngState {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return rngFromSeed(h);
}

export function next(r: RngState): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(r: RngState, minInclusive: number, maxInclusive: number): number {
  return Math.floor(next(r) * (maxInclusive - minInclusive + 1)) + minInclusive;
}

export function pick<T>(r: RngState, arr: readonly T[]): T {
  return arr[Math.floor(next(r) * arr.length)]!;
}

export function shuffle<T>(r: RngState, arr: T[]): T[] {
  // Fisher–Yates, in place. Returns the same array for chaining.
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(next(r) * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}
