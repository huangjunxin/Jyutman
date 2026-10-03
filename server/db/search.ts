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
}

const INDEXES: Record<Exclude<SearchMode, "empty">, { table: string; column: string }> = {
  trigram: { table: "articles_fts", column: "text_norm" },
  bigram: { table: "articles_bigram_fts", column: "seg" },
  unigram: { table: "articles_unigram_fts", column: "seg" },
};

/** 多取一條命中，用於判斷結果是否被 limit 截斷。 */
export interface SearchPageResult {
  rows: SearchRow[];
  /** 符合條件嘅總命中數（另跑一次 COUNT，唔受分頁影響）。 */
  total: number;
}

/**
 * 分頁檢索：bm25 排序 + LIMIT/OFFSET，另跑 COUNT 取總數。
 * （FTS5 嘅 bm25() 唔可以同窗口函數一齊用，故總數要獨立查一次。）
 */
export async function searchArticles(
  db: D1Database,
  plan: SearchPlan,
  corpora: readonly string[] = [],
  { page = 1, pageSize = RESULT_LIMIT }: { page?: number; pageSize?: number } = {},
): Promise<SearchPageResult> {
  if (plan.mode === "empty") return { rows: [], total: 0 };
  const { table, column } = INDEXES[plan.mode];
  const params: unknown[] = [ftsPhrase(column, plan.query)];
  let corpusFilter = "";
  if (corpora.length > 0) {
    corpusFilter = ` AND a.corpus IN (${corpora.map(() => "?").join(", ")})`;
    params.push(...corpora);
  }
  const from =
    ` FROM ${table}` +
    ` JOIN articles AS a ON a.id = ${table}.id` +
    ` WHERE ${table} MATCH ?${corpusFilter}`;
  const offset = Math.max(0, (page - 1) * pageSize);
  const rows =
    (
      await db
        .prepare(`SELECT a.id, a.corpus, a.issue, a.page, a.title, a.text${from} ORDER BY bm25(${table}) LIMIT ? OFFSET ?`)
        .bind(...params, pageSize, offset)
        .all<SearchRow>()
    ).results ?? [];
  const counted = await db
    .prepare(`SELECT COUNT(*) AS total${from}`)
    .bind(...params)
    .first<{ total: number }>();
  return { rows, total: Number(counted?.total ?? 0) };
}
