/**
 * GET /api/search：查詢歸一與路由、查 D1、組命中片段。
 * 響應形狀與 src/pages/search/index.astro 的解析對齊；命中可緩存一分鐘。
 * 分頁：page 由 1 起，page_size 默認 20、上限 50。
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
const PAGE_SIZE_MAX = 50;
const PAGE_MAX = 500;

/** 讀取整數查詢參數；缺省回 fallback，非法回 null。 */
function readQueryInteger(raw: string | undefined, fallback: number, min: number, max: number): number | null {
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) return null;
  return value;
}

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
  const page = readQueryInteger(c.req.query("page"), 1, 1, PAGE_MAX);
  if (page === null) {
    return c.json({ error: `page 唔啱（1 至 ${PAGE_MAX} 嘅整數）` }, 400, { "Cache-Control": NO_STORE });
  }
  const pageSize = readQueryInteger(c.req.query("page_size"), RESULT_LIMIT, 1, PAGE_SIZE_MAX);
  if (pageSize === null) {
    return c.json({ error: `page_size 唔啱（1 至 ${PAGE_SIZE_MAX} 嘅整數）` }, 400, { "Cache-Control": NO_STORE });
  }
  const corpora = (c.req.queries("corpus") ?? [])
    .filter((slug) => slug !== "")
    .slice(0, MAX_CORPUS_FILTERS);
  const { rows, total } = await searchArticles(c.env.DB, plan, corpora, { page, pageSize });
  const results = rows.map((row) => ({
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
      page,
      page_size: pageSize,
      total,
      results,
      more: page * pageSize < total,
    },
    200,
    { "Cache-Control": CACHE_CONTROL },
  );
}
