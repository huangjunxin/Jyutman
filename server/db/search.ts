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
export async function searchArticles(
  db: D1Database,
  plan: SearchPlan,
  corpora: readonly string[] = [],
  limit = RESULT_LIMIT,
): Promise<SearchRow[]> {
  if (plan.mode === "empty") return [];
  const { table, column } = INDEXES[plan.mode];
  const params: unknown[] = [ftsPhrase(column, plan.query)];
  let corpusFilter = "";
  if (corpora.length > 0) {
    corpusFilter = ` AND a.corpus IN (${corpora.map(() => "?").join(", ")})`;
    params.push(...corpora);
  }
  params.push(limit + 1);
  const statement =
    `SELECT a.id, a.corpus, a.issue, a.page, a.title, a.text` +
    ` FROM ${table}` +
    ` JOIN articles AS a ON a.id = ${table}.id` +
    ` WHERE ${table} MATCH ?${corpusFilter}` +
    ` ORDER BY bm25(${table})` +
    ` LIMIT ?`;
  const result = await db
    .prepare(statement)
    .bind(...params)
    .all<SearchRow>();
  return result.results ?? [];
}
