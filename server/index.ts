/**
 * Worker 入口：/api/* 走 Hono，其餘路徑由 Static Assets 直接服務。
 * 靜態資產的掛載見 wrangler.jsonc（run_worker_first 只匹配 /api/*）。
 */

import { Hono } from "hono";

import type { Env } from "./env.ts";
import { TokenBucketLimiter } from "./lib/rate-limit.ts";
import { handleSearch } from "./routes/search.ts";

const app = new Hono<{ Bindings: Env }>();

/** 輕量防濫用：每個 isolate 每 IP 30 次突發，之後約每兩秒回一個令牌。 */
const limiter = new TokenBucketLimiter({ capacity: 30, refillPerSecond: 0.5 });

app.use("/api/*", async (c, next) => {
  const ip = c.req.header("cf-connecting-ip") ?? "unknown";
  const decision = limiter.take(ip);
  if (!decision.allowed) {
    return c.json(
      { error: "請求過於頻繁，請稍後再試。" },
      429,
      {
        "Retry-After": String(decision.retryAfterSeconds),
        "Cache-Control": "no-store",
      },
    );
  }
  await next();
});

app.get("/api/search", handleSearch);

app.all("/api/*", (c) => c.json({ error: "無此接口" }, 404, { "Cache-Control": "no-store" }));

app.onError((error, c) => {
  console.error("api error", error);
  return c.json({ error: "檢索服務暫時未能使用，請稍後再試。" }, 500, { "Cache-Control": "no-store" });
});

export default app;
