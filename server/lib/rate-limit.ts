/**
 * 進程內 IP 令牌桶限流：Worker 每個 isolate 各自計數，只作輕量防濫用，
 * 不是精確配額；要精確限流需換 Durable Object 或 Cloudflare Rate Limiting。
 */

export interface RateLimitDecision {
  allowed: boolean;
  /** 被拒時建議的等待秒數，寫入 Retry-After。 */
  retryAfterSeconds: number;
}

export interface TokenBucketOptions {
  /** 桶容量，即突發上限。 */
  capacity?: number;
  /** 每秒回填的令牌數。 */
  refillPerSecond?: number;
  /** 空閒多久之後可被清理（毫秒）。 */
  idleMs?: number;
  /** 鍵數超過此值即清理空閒桶。 */
  maxKeys?: number;
}

export class TokenBucketLimiter {
  readonly capacity: number;
  readonly refillPerSecond: number;
  readonly idleMs: number;
  readonly maxKeys: number;

  #buckets = new Map<string, { tokens: number; updatedAt: number }>();

  constructor(options: TokenBucketOptions = {}) {
    this.capacity = options.capacity ?? 30;
    this.refillPerSecond = options.refillPerSecond ?? 0.5;
    this.idleMs = options.idleMs ?? 10 * 60 * 1000;
    this.maxKeys = options.maxKeys ?? 5000;
  }

  /** 取一個令牌；被拒時給出建議重試秒數。 */
  take(key: string, now = Date.now()): RateLimitDecision {
    if (this.#buckets.size >= this.maxKeys) this.#sweep(now);
    const bucket = this.#buckets.get(key) ?? { tokens: this.capacity, updatedAt: now };
    const elapsed = Math.max(0, now - bucket.updatedAt);
    bucket.tokens = Math.min(this.capacity, bucket.tokens + (elapsed / 1000) * this.refillPerSecond);
    bucket.updatedAt = now;
    if (bucket.tokens < 1) {
      this.#buckets.set(key, bucket);
      const wait = (1 - bucket.tokens) / this.refillPerSecond;
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(wait)) };
    }
    bucket.tokens -= 1;
    this.#buckets.set(key, bucket);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  #sweep(now: number): void {
    for (const [key, bucket] of this.#buckets) {
      if (now - bucket.updatedAt > this.idleMs) this.#buckets.delete(key);
    }
    if (this.#buckets.size >= this.maxKeys) this.#buckets.clear();
  }
}
