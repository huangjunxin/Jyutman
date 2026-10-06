/**
 * 數據層統計純函數：字數、今譯篇數、首個可讀頁、期號篇目。
 * 只收數據做參數（corpus.ts 負責接 import.meta.glob），方便 node:test 直接測。
 */

import type { PageDocument, TranslationTable } from "./types.ts";

/** 「進入閱讀」跳過封面：首個有咁多字正文嘅頁先算可讀（原型規則）。 */
export const READABLE_MIN_CHARS = 40;

/** 正文字數：去晒空白，按碼點計（擴展區字算一個字）。 */
export function charCount(text: string): number {
  let count = 0;
  for (const char of text) if (!/\s/u.test(char)) count += 1;
  return count;
}

/** 一批頁嘅正文總字數（只計文章塊，版面標記唔計）。 */
export function countCharacters(pages: readonly PageDocument[]): number {
  let total = 0;
  for (const page of pages) {
    for (const block of page.blocks) if (block.type === "article") total += charCount(block.text);
  }
  return total;
}

/** 附今譯嘅篇數：各期今譯表嘅鍵數相加。 */
export function countTranslated(tables: readonly TranslationTable[]): number {
  return tables.reduce((sum, table) => sum + Object.keys(table).length, 0);
}

/** 首個有 minChars 字以上文章塊嘅頁碼（掃描序）；冇就返回第一頁，冇頁返回 undefined。 */
export function firstReadablePage(
  pages: readonly PageDocument[],
  minChars = READABLE_MIN_CHARS,
): number | undefined {
  const readable = pages.find((page) =>
    page.blocks.some((block) => block.type === "article" && charCount(block.text) >= minChars),
  );
  return (readable ?? pages[0])?.page;
}

/** 期號篇目一條：頁碼、文章 id、篇名。 */
export interface TocEntry {
  page: number;
  id: string;
  title: string;
}

/** 期號篇目：按頁序、塊序列出有篇名嘅文章（篇名為 null 或空白嘅略去）。 */
export function issueToc(pages: readonly PageDocument[]): TocEntry[] {
  const toc: TocEntry[] = [];
  for (const page of pages) {
    for (const block of page.blocks) {
      if (block.type === "article" && block.title?.trim()) {
        toc.push({ page: page.page, id: block.id, title: block.title });
      }
    }
  }
  return toc;
}
