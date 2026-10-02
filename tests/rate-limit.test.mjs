import assert from "node:assert/strict";
import test from "node:test";

import { TokenBucketLimiter } from "../server/lib/rate-limit.ts";

test("TokenBucketLimiter：突發用盡容量之後拒絕，並給出重試秒數", () => {
  const limiter = new TokenBucketLimiter({ capacity: 3, refillPerSecond: 0.5 });
  const now = 1_000_000;
  assert.equal(limiter.take("ip", now).allowed, true);
  assert.equal(limiter.take("ip", now).allowed, true);
  assert.equal(limiter.take("ip", now).allowed, true);
  const denied = limiter.take("ip", now);
  assert.equal(denied.allowed, false);
  assert.equal(denied.retryAfterSeconds, 2, "回填速率每秒半個，欠一個令牌等兩秒");
});

test("TokenBucketLimiter：令牌隨時間回填，且不超過容量", () => {
  const limiter = new TokenBucketLimiter({ capacity: 2, refillPerSecond: 1 });
  const start = 2_000_000;
  limiter.take("ip", start);
  limiter.take("ip", start);
  assert.equal(limiter.take("ip", start).allowed, false);
  assert.equal(limiter.take("ip", start + 1000).allowed, true, "一秒回一個");
  assert.equal(limiter.take("ip", start + 1000).allowed, false);
  assert.equal(limiter.take("ip", start + 60_000).allowed, true, "久等之後只回滿容量");
  assert.equal(limiter.take("ip", start + 60_000).allowed, true);
  assert.equal(limiter.take("ip", start + 60_000).allowed, false, "不超過容量");
});

test("TokenBucketLimiter：不同鍵互不影響", () => {
  const limiter = new TokenBucketLimiter({ capacity: 1, refillPerSecond: 1 });
  assert.equal(limiter.take("a", 0).allowed, true);
  assert.equal(limiter.take("b", 0).allowed, true);
  assert.equal(limiter.take("a", 0).allowed, false);
});
