/**
 * 主機策略純函數：規範主機、www 別名、workers.dev 預覽域與異常主機的分流。
 * 供 Worker 入口（server/index.ts）與測試共用；跳轉一律 301 並保留原路徑與查詢串。
 */

/** 站點規範主機（canonical host）。 */
export const CANONICAL_HOST = "jyutman.com";

/** www 別名主機；zone 內暫無 DNS 記錄，記錄建成後由同一條規則跳轉。 */
export const WWW_HOST = `www.${CANONICAL_HOST}`;

/** workers.dev 預覽域後綴（含版本預覽子域），不應被搜索引擎收錄。 */
export const WORKERS_DEV_SUFFIX = ".workers.dev";

/** 本地開發放行的主機（wrangler dev / 預覽），唔參與跳轉。 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export interface HostDecision {
  /** redirect：301 到 location；pass：照常服務。 */
  action: "redirect" | "pass";
  /** redirect 的目標（已含原路徑與查詢串）；pass 時為 null。 */
  location: string | null;
  /** 響應是否加 X-Robots-Tag: noindex。 */
  noindex: boolean;
}

function canonicalUrl(pathname: string, search: string): string {
  return `https://${CANONICAL_HOST}${pathname}${search}`;
}

/** 由請求主機、路徑與查詢串決定分流。 */
export function decideHost(hostname: string, pathname: string, search = ""): HostDecision {
  const host = hostname.toLowerCase();
  if (host === CANONICAL_HOST) {
    return { action: "pass", location: null, noindex: false };
  }
  if (host === WWW_HOST) {
    return { action: "redirect", location: canonicalUrl(pathname, search), noindex: false };
  }
  if (host.endsWith(WORKERS_DEV_SUFFIX)) {
    return { action: "pass", location: null, noindex: true };
  }
  if (LOCAL_HOSTS.has(host) || host.endsWith(".localhost")) {
    return { action: "pass", location: null, noindex: false };
  }
  // 其餘（子域、直連 IP、惡意域）一律 301 回規範主機。
  return { action: "redirect", location: canonicalUrl(pathname, search), noindex: false };
}
