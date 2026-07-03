type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

type Bucket = {
  count: number;
  resetAt: number;
};

export class RequestRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly windowMs: number) {}

  consume(key: string, maximum: number): RateLimitResult {
    const now = Date.now();
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      this.removeExpiredBuckets(now);
      return { allowed: true };
    }

    current.count += 1;
    if (current.count <= maximum) return { allowed: true };
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1_000)) };
  }

  private removeExpiredBuckets(now: number) {
    if (this.buckets.size < 10_000) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}