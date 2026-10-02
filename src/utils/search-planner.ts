/**
 * 檢索管線純函數：輸入歸一、查詢路由、n-gram 切分與命中片段抽取。
 *
 * 路由與切分規則依 `docs/spikes/0.1-d1-trigram.md` 的實測結論：
 * 3 字及以上走 trigram 整串短語 MATCH；2 字走 bigram 輔助表；1 字走 unigram 輔助表。
 * 漢字連續段滑動取 n-gram，拉丁與數字連續段按整段保留；標點截斷連續段；
 * 重複 n-gram 一律保留（位置語義所依，去重會令短查詢誤中）。
 *
 * 索引端（scripts/sync-corpus.mjs）與查詢端（server/）共用本模組，保證兩邊切法一致。
 */

import { normalize, toTraditional } from "./normalize.ts";

/** 單次檢索返回的命中上限（多取一條用於判斷是否截斷）。 */
export const RESULT_LIMIT = 20;

/** 命中片段在命中點前後各取的字數。 */
export const SNIPPET_RADIUS = 60;

/** 查詢串長度上限（碼點）；超長查詢既不現實也拖慢索引。 */
export const MAX_QUERY_LENGTH = 100;

export type SearchMode = "empty" | "trigram" | "bigram" | "unigram";

export interface SearchPlan {
  mode: SearchMode;
  /** 歸一之後的檢索詞（繁簡歸一、去空白）。 */
  query: string;
  /** 檢索詞長度（碼點計）。 */
  length: number;
}

/** 由用戶原文決定走哪條索引路徑。 */
export function planSearch(raw: string): SearchPlan {
  const query = normalize(raw);
  const length = [...query].length;
  const mode: SearchMode =
    length === 0 ? "empty" : length >= 3 ? "trigram" : length === 2 ? "bigram" : "unigram";
  return { mode, query, length };
}

/**
 * 構造 FTS5 查詢式：限定到某一列，並把字符串裏的雙引號按 FTS5 規則翻倍轉義。
 * 整串包在雙引號內即按短語處理，其餘 FTS5 元字符在引號內一律作字面量。
 */
export function ftsPhrase(column: string, query: string): string {
  return `${column} : "${query.replaceAll('"', '""')}"`;
}

/** 漢字（含擴展 A/B 與兼容區）；其餘字母、數字、附標記歸「拉丁段」。 */
export function isCjkIdeograph(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0x20000 && code <= 0x3134f)
  );
}

const WORD_CHAR_PATTERN = /[\p{L}\p{N}\p{M}]/u;

/**
 * 把正文切成空格分隔的 n-gram 串，供 bigram / unigram 輔助表索引。
 * size 為 2 時漢字段滑動取二元組，為 1 時逐字；拉丁與數字段不分大小一律整段保留。
 */
export function segmentNgrams(text: string, size: 1 | 2): string {
  const tokens: string[] = [];
  let cjkRun: string[] = [];
  let wordRun: string[] = [];

  const flushCjk = () => {
    for (let i = 0; i + size <= cjkRun.length; i += 1) {
      tokens.push(cjkRun.slice(i, i + size).join(""));
    }
    cjkRun = [];
  };
  const flushWord = () => {
    if (wordRun.length > 0) tokens.push(wordRun.join(""));
    wordRun = [];
  };

  for (const char of text) {
    if (isCjkIdeograph(char)) {
      flushWord();
      cjkRun.push(char);
    } else if (WORD_CHAR_PATTERN.test(char)) {
      flushCjk();
      wordRun.push(char);
    } else {
      flushCjk();
      flushWord();
    }
  }
  flushCjk();
  flushWord();
  return tokens.join(" ");
}

/** 歸一後的正文，以及每個歸一字符對應的原文起止下標（去空白令下標不再一一對應）。 */
export interface NormalizedText {
  normalized: string;
  starts: number[];
  ends: number[];
}

/** 逐字歸一並記錄原文下標，供片段抽取把命中點映回原文。 */
export function normalizeWithMap(text: string): NormalizedText {
  const chars: string[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  let index = 0;
  for (const char of text) {
    const width = char.length;
    if (!/\s/u.test(char)) {
      chars.push(toTraditional(char));
      starts.push(index);
      ends.push(index + width);
    }
    index += width;
  }
  return { normalized: chars.join(""), starts, ends };
}

/** 逐字小寫比較的定位；與 FTS5 默認大小寫折疊一致，避免同一字長度變化。 */
function findFoldIndex(haystack: string, needle: string): number {
  if (needle === "") return -1;
  const chars = [...haystack];
  const wanted = [...needle].map((char) => char.toLowerCase());
  const first = wanted[0];
  for (let i = 0; i + wanted.length <= chars.length; i += 1) {
    if (chars[i].toLowerCase() !== first) continue;
    let matched = true;
    for (let j = 1; j < wanted.length; j += 1) {
      if (chars[i + j].toLowerCase() !== wanted[j]) {
        matched = false;
        break;
      }
    }
    if (matched) return i;
  }
  return -1;
}

function collapse(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

/**
 * 由命中葉的原文取片段：命中點前後各約 radius 字，兩端按需補省略號。
 * 找不到命中點（例如只有標題命中）時退回原文開頭，保證片段不為空。
 */
export function extractSnippet(text: string, query: string, radius = SNIPPET_RADIUS): string {
  const { normalized, starts, ends } = normalizeWithMap(text);
  const position = findFoldIndex(normalized, query);
  if (position < 0) {
    const head = collapse(text.slice(0, radius * 2));
    if (head === "") return "";
    return text.length > radius * 2 ? `${head}…` : head;
  }
  const start = Math.max(0, position - radius);
  const end = Math.min(starts.length, position + [...query].length + radius);
  const slice = collapse(text.slice(starts[start], ends[end - 1]));
  const prefix = start > 0 ? "…" : "";
  const suffix = end < starts.length ? "…" : "";
  return `${prefix}${slice}${suffix}`;
}
