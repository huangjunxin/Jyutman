/**
 * D1 檢索查詢：按查詢模式選索引表，bm25 排序，可選 corpus 過濾。
 * 表結構與欄位見 db/import.sql；模式路由見 src/utils/search-planner.ts。
 */

import type { D1Database } from "@cloudflare/workers-types";

import {
  ftsPhrase,
  RESULT_LIMIT,
  type SearchMode,
  type SearchPlan,
} from "../../src/utils/search-planner.ts";

export interface SearchRow {
  id: string;
  corpus: string;
  issue: string;
  page: number;
  title: string | null;
  text: string;
  status: string;
}

const INDEXES: Record<Exclude<SearchMode, "empty">, { table: string; column: string }> = {
  trigram: { table: "articles_fts", column: "text_norm" },
  bigram: { table: "articles_bigram_fts", column: "seg" },
  unigram: { table: "articles_unigram_fts", column: "seg" },
};

export interface SearchPageResult {
  rows: SearchRow[];
  /** 符合條件（含 corpus 過濾）嘅總命中篇數，唔受分頁影響。 */
  total: number;
  /** 逐語料命中篇數（唔受 corpus 過濾影響），供篩選 pill 顯示；冇命中嘅語料唔列。 */
  facets: Record<string, number>;
}

/**
 * 分頁檢索：bm25 排序 + LIMIT/OFFSET；另跑一條 GROUP BY a.corpus（唔加 corpus 過濾）
 * 取逐語料篇數，總數由篩選中嘅語料加埋得出。
 * （FTS5 嘅 bm25() 唔可以同窗口函數一齊用，故計數要獨立查一次。）
 */
export async function searchArticles(
  db: D1Database,
  plan: SearchPlan,
  corpora: readonly string[] = [],
  { page = 1, pageSize = RESULT_LIMIT }: { page?: number; pageSize?: number } = {},
): Promise<SearchPageResult> {
  if (plan.mode === "empty") return { rows: [], total: 0, facets: {} };
  const { table, column } = INDEXES[plan.mode];
  const phrase = ftsPhrase(column, plan.query);
  const from =
    ` FROM ${table}` +
    ` JOIN articles AS a ON a.id = ${table}.id` +
    ` WHERE ${table} MATCH ?`;
  const corpusFilter = corpora.length > 0 ? ` AND a.corpus IN (${corpora.map(() => "?").join(", ")})` : "";
  const offset = Math.max(0, (page - 1) * pageSize);
  const [hits, counted] = await Promise.all([
    db
      .prepare(
        `SELECT a.id, a.corpus, a.issue, a.page, a.title, a.text, a.status${from}${corpusFilter}` +
          ` ORDER BY bm25(${table}) LIMIT ? OFFSET ?`,
      )
      .bind(phrase, ...corpora, pageSize, offset)
      .all<SearchRow>(),
    db
      .prepare(`SELECT a.corpus AS corpus, COUNT(*) AS n${from} GROUP BY a.corpus`)
      .bind(phrase)
      .all<{ corpus: string; n: number }>(),
  ]);
  const facets: Record<string, number> = {};
  for (const { corpus, n } of counted.results ?? []) facets[corpus] = Number(n);
  const wanted = corpora.length > 0 ? new Set(corpora) : null;
  let total = 0;
  for (const [corpus, n] of Object.entries(facets)) if (wanted === null || wanted.has(corpus)) total += n;
  return { rows: hits.results ?? [], total, facets };
}
