/**
 * Worker 入口：所有請求先過主機策略（規範主機、www 跳轉、預覽域 noindex），
 * 再分派：/api/* 走 Hono，其餘交 Static Assets 直出。
 * 掛載與 run_worker_first 設定見 wrangler.jsonc。
 */

import type { ExecutionContext } from "@cloudflare/workers-types";
import { Hono } from "hono";
import type { Context } from "hono";

import { decideHost } from "../src/utils/host-policy.ts";
import type { Env } from "./env.ts";
import { TokenBucketLimiter } from "./lib/rate-limit.ts";
import {
  handleAdjudicate,
  handleCorrect,
  handleQueue,
  handleReports,
} from "./routes/corrections.ts";
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

app.post("/api/correct", handleCorrect);
app.get("/api/reports", handleReports);
app.get("/api/queue", handleQueue);
app.post("/api/adjudicate", handleAdjudicate);

const notFound = (c: Context<{ Bindings: Env }>) =>
  c.json({ error: "無此接口" }, 404, { "Cache-Control": "no-store" });

app.all("/api", notFound);
app.all("/api/*", notFound);

app.onError((error, c) => {
  console.error("api error", error);
  return c.json({ error: "檢索服務暫時未能使用，請稍後再試。" }, 500, { "Cache-Control": "no-store" });
});

/** 預覽域響應統一加 noindex，避免被搜索引擎收錄。 */
const ROBOTS_HEADER = "X-Robots-Tag";
const ROBOTS_VALUE = "noindex";

function withNoindex(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set(ROBOTS_HEADER, ROBOTS_VALUE);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const decision = decideHost(url.hostname, url.pathname, url.search);
    if (decision.action === "redirect" && decision.location !== null) {
      return Response.redirect(decision.location, 301);
    }
    const isApi = url.pathname === "/api" || url.pathname.startsWith("/api/");
    const response = isApi ? await app.fetch(request, env, ctx) : await env.ASSETS.fetch(request);
    return decision.noindex ? withNoindex(response) : response;
  },
};
