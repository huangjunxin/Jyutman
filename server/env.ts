import type { D1Database } from "@cloudflare/workers-types";

/**
 * Static Assets 綁定：只用到 fetch，用結構化聲明，
 * 避免 @cloudflare/workers-types 的 Request/Response 與 DOM lib 型別互斥。
 */
export interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

/** Worker 綁定：wrangler.jsonc 的 d1_databases.binding 為 DB，assets.binding 為 ASSETS。 */
export interface Env {
  DB: D1Database;
  /** Static Assets 綁定：非 /api 請求由 Worker 轉交資產層直出。 */
  ASSETS: AssetFetcher;
}
