/**
 * 維護端鑑權：Bearer 令牌比對用定長比較，避免時間差洩漏。
 * v1 為單一 admin token（wrangler secret）；升級路徑為 Cloudflare Access（見 docs/03 第 7 節）。
 */

/** 定長比較：長度唔同即 false，其餘逐字元 XOR 累加。 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** 由 Authorization 頭取出 Bearer 令牌；唔符格式返回 null。 */
export function bearerToken(header: string | undefined): string | null {
  if (header === undefined) return null;
  const match = /^Bearer\s+(\S+)$/iu.exec(header.trim());
  return match?.[1] ?? null;
}
