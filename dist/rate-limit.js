export class RequestRateLimiter {
    windowMs;
    buckets = new Map();
    constructor(windowMs) {
        this.windowMs = windowMs;
    }
    consume(key, maximum) {
        const now = Date.now();
        const current = this.buckets.get(key);
        if (!current || current.resetAt <= now) {
            this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
            this.removeExpiredBuckets(now);
            return { allowed: true };
        }
        current.count += 1;
        if (current.count <= maximum)
            return { allowed: true };
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1_000)) };
    }
    removeExpiredBuckets(now) {
        if (this.buckets.size < 10_000)
            return;
        for (const [key, bucket] of this.buckets) {
            if (bucket.resetAt <= now)
                this.buckets.delete(key);
        }
    }
}
