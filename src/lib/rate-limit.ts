// Tiny in-memory token-bucket. Adequate for a single-region Vercel deploy.
// For multi-region or higher trust, swap for Upstash/Redis-backed limits.

type Bucket = { tokens: number; lastRefill: number };
const buckets = new Map<string, Bucket>();

const CAPACITY = 30;
const REFILL_PER_SEC = 5;

export function take(key: string): boolean {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: CAPACITY, lastRefill: now };
  const delta = (now - b.lastRefill) / 1000;
  b.tokens = Math.min(CAPACITY, b.tokens + delta * REFILL_PER_SEC);
  b.lastRefill = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(key, b);
  return true;
}
