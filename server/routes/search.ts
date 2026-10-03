/**
 * GET /api/search：查詢歸一與路由、查 D1、組命中片段。
 * 響應形狀與 src/pages/search/index.astro 的解析對齊；命中可緩存一分鐘。
 */

import type { Context } from "hono";

import {
  locateAndSlice,
  MAX_QUERY_LENGTH,
  planSearch,
  RESULT_LIMIT,
} from "../../src/utils/search-planner.ts";
import { searchArticles } from "../db/search.ts";
import type { Env } from "../env.ts";

const CACHE_CONTROL = "public, max-age=60";
const NO_STORE = "no-store";
const MAX_CORPUS_FILTERS = 20;

export async function handleSearch(c: Context<{ Bindings: Env }>): Promise<Response> {
  const raw = c.req.query("q");
  if (raw === undefined) {
    return c.json({ error: "缺少 q 參數" }, 400, { "Cache-Control": NO_STORE });
  }
  const plan = planSearch(raw);
  if (plan.length > MAX_QUERY_LENGTH) {
    return c.json(
      { error: `查詢超過 ${MAX_QUERY_LENGTH} 字上限，請縮短再試。` },
      400,
      { "Cache-Control": NO_STORE },
    );
  }
  const corpora = (c.req.queries("corpus") ?? [])
    .filter((slug) => slug !== "")
    .slice(0, MAX_CORPUS_FILTERS);
  const rows = await searchArticles(c.env.DB, plan, corpora);
  const results = rows.slice(0, RESULT_LIMIT).map((row) => ({
    id: row.id,
    corpus: row.corpus,
    issue: row.issue,
    page: row.page,
    title: row.title,
    ...locateAndSlice(row.text, plan.query),
  }));
  return c.json(
    {
      query: raw,
      normalized: plan.query,
      mode: plan.mode,
      results,
      more: rows.length > RESULT_LIMIT,
    },
    200,
    { "Cache-Control": CACHE_CONTROL },
  );
}
