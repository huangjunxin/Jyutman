/**
 * 校對通道 API（3a）：讀者匿名上報、篇內上報清單、維護端隊列與裁決。
 * 匿名制：唔收任何聯繫方式；防濫用靠 IP 令牌桶（server/index.ts 中介層）加蜜罐欄位。
 * 維護端鑑權：Authorization: Bearer <ADMIN_TOKEN>（wrangler secret）。
 */

import type { Context } from "hono";

import {
  adjudicate,
  findPageId,
  insertCorrection,
  listQueue,
  listReports,
} from "../db/corrections.ts";
import type { Env } from "../env.ts";
import { bearerToken, safeEqual } from "../lib/auth.ts";
import {
  isRecord,
  readEnum,
  readInteger,
  readOptionalText,
  readText,
} from "../lib/validate.ts";

type AppContext = Context<{ Bindings: Env }>;

/** 上報類型：與閱讀器表單 chips 一致。 */
export const CORRECTION_TYPES = ["錯字", "缺字", "標點分段", "今譯疑問", "其他"] as const;
export type CorrectionType = (typeof CORRECTION_TYPES)[number];

export const ADJUDICATE_ACTIONS = {
  accept: "accepted",
  reject: "rejected",
  defer: "deferred",
} as const;
export type AdjudicateAction = keyof typeof ADJUDICATE_ACTIONS;

const LIMITS = {
  articleId: 64,
  selectedText: 200,
  fragment: 600,
  suggestion: 1000,
  paragraphIndex: 5000,
} as const;

const NO_STORE = { "Cache-Control": "no-store" } as const;

function badRequest(c: AppContext, error: string): Response {
  return c.json({ error }, 400, NO_STORE);
}

/** 維護端鑑權：未設 ADMIN_TOKEN 或者令牌唔對一律 401。 */
function isAdmin(c: AppContext): boolean {
  const token = bearerToken(c.req.header("authorization"));
  const expected = c.env.ADMIN_TOKEN;
  if (token === null || expected === undefined || expected === "") return false;
  return safeEqual(token, expected);
}

/** POST /api/correct：匿名上報，寫入 pending。 */
export async function handleCorrect(c: AppContext): Promise<Response> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return badRequest(c, "請求體唔係有效 JSON");
  }
  const record = isRecord(body) ? body : {};

  // 蜜罐：機械人填咗就當成功，但唔入庫（唔畀對方任何信號）。
  if (typeof record.website === "string" && record.website.trim() !== "") {
    return c.json({ ok: true, id: null }, 200, NO_STORE);
  }

  const articleId = readText(record.article_id, { label: "文章編號", max: LIMITS.articleId });
  if (!articleId.ok) return badRequest(c, articleId.error);
  const selectedText = readText(record.selected_text, { label: "所選文字", max: LIMITS.selectedText });
  if (!selectedText.ok) return badRequest(c, selectedText.error);
  const fragment = readText(record.fragment, { label: "前後文", max: LIMITS.fragment });
  if (!fragment.ok) return badRequest(c, fragment.error);
  const type = readEnum(record.type, CORRECTION_TYPES, "問題類型");
  if (!type.ok) return badRequest(c, type.error);
  const suggestion = readOptionalText(record.suggestion, { label: "建議", max: LIMITS.suggestion });
  if (!suggestion.ok) return badRequest(c, suggestion.error);
  const paragraphIndex = readInteger(record.paragraph_index, {
    label: "段落序號",
    min: 0,
    max: LIMITS.paragraphIndex,
  });
  if (!paragraphIndex.ok) return badRequest(c, paragraphIndex.error);

  const pageId = await findPageId(c.env.DB, articleId.value);
  const id = await insertCorrection(c.env.DB, {
    articleId: articleId.value,
    pageId,
    fragment: fragment.value,
    selectedText: selectedText.value,
    paragraphIndex: paragraphIndex.value,
    type: type.value,
    suggestion: suggestion.value,
  });
  return c.json({ ok: true, id }, 200, NO_STORE);
}

/** GET /api/reports?article_id=：該篇待審上報（供已回報角標還原）。 */
export async function handleReports(c: AppContext): Promise<Response> {
  const articleId = readText(c.req.query("article_id"), { label: "文章編號", max: LIMITS.articleId });
  if (!articleId.ok) return badRequest(c, articleId.error);
  const reports = await listReports(c.env.DB, articleId.value);
  return c.json({ article_id: articleId.value, reports }, 200, NO_STORE);
}

/** GET /api/queue?status=&corpus=：審閱隊列（需維護權杖）。 */
export async function handleQueue(c: AppContext): Promise<Response> {
  if (!isAdmin(c)) return c.json({ error: "需要維護權杖" }, 401, NO_STORE);
  const status = c.req.query("status") ?? "";
  const corpus = c.req.query("corpus") ?? "";
  const items = await listQueue(c.env.DB, { status, corpus });
  return c.json({ items }, 200, NO_STORE);
}

/** POST /api/adjudicate：{id, action}，需維護權杖。 */
export async function handleAdjudicate(c: AppContext): Promise<Response> {
  if (!isAdmin(c)) return c.json({ error: "需要維護權杖" }, 401, NO_STORE);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return badRequest(c, "請求體唔係有效 JSON");
  }
  const record = isRecord(body) ? body : {};
  const id = readInteger(record.id, { label: "上報編號", min: 1, max: Number.MAX_SAFE_INTEGER });
  if (!id.ok) return badRequest(c, id.error);
  const action = readEnum(
    record.action,
    Object.keys(ADJUDICATE_ACTIONS) as AdjudicateAction[],
    "裁決動作",
  );
  if (!action.ok) return badRequest(c, action.error);
  const status = ADJUDICATE_ACTIONS[action.value];
  const updated = await adjudicate(c.env.DB, id.value, status);
  if (!updated) return c.json({ error: "冇呢條上報" }, 404, NO_STORE);
  return c.json({ ok: true, id: id.value, status }, 200, NO_STORE);
}
