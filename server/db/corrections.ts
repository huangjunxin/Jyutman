/**
 * corrections 表訪問：讀者上報（pending）、篇內上報清單、審閱隊列、裁決。
 * 表結構見 db/migrations/0001-corrections.sql 與 docs/03 第 7 節。
 */

import type { D1Database } from "@cloudflare/workers-types";

export interface CorrectionInput {
  articleId: string;
  pageId: string | null;
  fragment: string;
  selectedText: string;
  paragraphIndex: number;
  /** 篇內正文碼點區間 [spanStart, spanEnd)；舊客戶端唔送就係 null。 */
  spanStart: number | null;
  spanEnd: number | null;
  type: string;
  suggestion: string | null;
}

export interface ReportRow {
  id: number;
  fragment: string;
  selected_text: string;
  paragraph_index: number | null;
  span_start: number | null;
  span_end: number | null;
  type: string;
  suggestion: string | null;
  created_at: string;
}

export interface QueueRow {
  id: number;
  article_id: string;
  page_id: string | null;
  type: string;
  fragment: string;
  selected_text: string;
  paragraph_index: number | null;
  suggestion: string | null;
  note: string | null;
  status: string;
  created_at: string;
  corpus: string | null;
  issue: string | null;
  page: number | null;
  title: string | null;
}

/** 由文章 id 推出頁級 page_id（<corpus>/<issue>/<三位頁碼>）；查唔到回 null。 */
export async function findPageId(db: D1Database, articleId: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT corpus, issue, page FROM articles WHERE id = ?")
    .bind(articleId)
    .first<{ corpus: string; issue: string; page: number }>();
  if (row === null || row === undefined) return null;
  return `${row.corpus}/${row.issue}/${String(row.page).padStart(3, "0")}`;
}

/** 寫入一條待審上報，返回新行 id。 */
export async function insertCorrection(db: D1Database, input: CorrectionInput): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO corrections
         (article_id, page_id, fragment, selected_text, paragraph_index, type, suggestion, span_start, span_end, note, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'pending', ?)`,
    )
    .bind(
      input.articleId,
      input.pageId,
      input.fragment,
      input.selectedText,
      input.paragraphIndex,
      input.type,
      input.suggestion,
      input.spanStart,
      input.spanEnd,
      new Date().toISOString(),
    )
    .run();
  return Number(result.meta.last_row_id ?? 0);
}

/** 某篇仲待審嘅上報（供已回報角標還原；有區間就按區間標）。 */
export async function listReports(db: D1Database, articleId: string): Promise<ReportRow[]> {
  const result = await db
    .prepare(
      `SELECT id, fragment, selected_text, paragraph_index, span_start, span_end, type, suggestion, created_at
         FROM corrections
        WHERE article_id = ? AND status = 'pending'
        ORDER BY id DESC
        LIMIT 200`,
    )
    .bind(articleId)
    .all<ReportRow>();
  return result.results ?? [];
}

/** 審閱隊列：corrections 左連 articles 取語料資訊；status / corpus 可選過濾。 */
export async function listQueue(
  db: D1Database,
  filters: { status?: string; corpus?: string },
): Promise<QueueRow[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filters.status !== undefined && filters.status !== "") {
    conditions.push("c.status = ?");
    params.push(filters.status);
  }
  if (filters.corpus !== undefined && filters.corpus !== "") {
    conditions.push("a.corpus = ?");
    params.push(filters.corpus);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await db
    .prepare(
      `SELECT c.id, c.article_id, c.page_id, c.type, c.fragment, c.selected_text, c.paragraph_index,
              c.suggestion, c.note, c.status, c.created_at,
              a.corpus, a.issue, a.page, a.title
         FROM corrections AS c
         LEFT JOIN articles AS a ON a.id = c.article_id
         ${where}
        ORDER BY c.id DESC
        LIMIT 200`,
    )
    .bind(...params)
    .all<QueueRow>();
  return result.results ?? [];
}

/** 裁決一條上報；返回是否有行被更新。 */
export async function adjudicate(
  db: D1Database,
  id: number,
  status: "accepted" | "rejected" | "deferred",
): Promise<boolean> {
  const result = await db
    .prepare("UPDATE corrections SET status = ? WHERE id = ?")
    .bind(status, id)
    .run();
  return Number(result.meta.changes ?? 0) > 0;
}
