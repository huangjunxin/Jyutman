import type { D1Database } from "@cloudflare/workers-types";

/** Worker 綁定：wrangler.jsonc 的 d1_databases.binding 為 DB。 */
export interface Env {
  DB: D1Database;
}
