/**
 * 閱讀頁展示層純函數：帶正文下標嘅段落 HTML、今譯譯註、檢索高亮區間、報錯區間同前後文。
 * 構建期（頁面 frontmatter）同瀏覽器端（閱讀頁 <script>）共用；唔掂 DOM，方便 node:test 直接測。
 */

import { normalize } from "./normalize.ts";
import { paragraphJoin, renderAnnotatedParagraph, type MergedParagraph } from "./reader.ts";
import { normalizeWithMap } from "./search-planner.ts";

/** 報錯問題類型：閱讀頁 chips 同 POST /api/correct 校驗共用（server/routes/corrections.ts 轉出）。 */
export const CORRECTION_TYPES = ["錯字", "缺字", "標點分段", "今譯疑問", "其他"] as const;

function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/**
 * 連排段落 HTML（同 renderMergedParagraph 一樣逐片注音、按規則連接），
 * 但每片包一層 <span data-o="正文下標">，瀏覽器端揀字時可以換算返正文碼點區間。
 */
export function renderParagraphSegments(
  paragraph: MergedParagraph,
  readings: ReadonlyMap<number, string>,
): string {
  let html = "";
  let previous = "";
  for (const span of paragraph.spans) {
    if (previous !== "") html += paragraphJoin(previous, span.text);
    html += `<span data-o="${span.start}">${renderAnnotatedParagraph(span.text, span.start, readings)}</span>`;
    previous = span.text;
  }
  return html;
}

/** 今譯 HTML：轉義之後，將〔…〕譯者註包成 <span class="tr-note">。 */
export function renderTranslation(text: string): string {
  return text
    .split(/(〔[^〕]*〕)/u)
    .map((part) => (/^〔[^〕]*〕$/u.test(part) ? `<span class="tr-note">${escapeHtml(part)}</span>` : escapeHtml(part)))
    .join("");
}

/**
 * 檢索高亮：喺原文搵歸一（簡轉繁、去空白）後嘅查詢詞，逐個命中返回原文 UTF-16 區間 [start, end)。
 * 大小寫唔分（同 FTS5 一致），命中唔重疊；查詢歸一後係空就冇命中。
 */
export function highlightRanges(text: string, query: string): [number, number][] {
  const needle = [...normalize(query)].map((char) => char.toLowerCase());
  if (needle.length === 0) return [];
  const { normalized, starts, ends } = normalizeWithMap(text);
  const hay = [...normalized].map((char) => char.toLowerCase());
  const ranges: [number, number][] = [];
  let i = 0;
  while (i + needle.length <= hay.length) {
    if (needle.every((char, j) => hay[i + j] === char)) {
      ranges.push([starts[i], ends[i + needle.length - 1]]);
      i += needle.length;
    } else {
      i += 1;
    }
  }
  return ranges;
}

/** 揀字落喺某一片正文嘅部分：start 為 text 首字喺正文嘅碼點下標。 */
export interface SelectionPiece {
  start: number;
  text: string;
}

/** 由揀中嘅各片推出正文碼點區間 [start, end)，兩頭空白唔計；全係空白返回 null。 */
export function selectionSpan(pieces: readonly SelectionPiece[]): { start: number; end: number } | null {
  let start = -1;
  let end = -1;
  for (const piece of pieces) {
    let offset = piece.start;
    for (const char of piece.text) {
      if (!/\s/u.test(char)) {
        if (start < 0) start = offset;
        end = offset + 1;
      }
      offset += 1;
    }
  }
  return start < 0 ? null : { start, end };
}

/** 前後文：所選文字前後各取 radius 個碼點；喺 host 搵唔到就只回所選文字。 */
export function fragmentAround(host: string, text: string, radius = 20): string {
  const at = host.indexOf(text);
  if (at < 0) return text;
  const before = [...host.slice(0, at)].slice(-radius).join("");
  const after = [...host.slice(at + text.length)].slice(0, radius).join("");
  return before + text + after;
}

/** 按 UTF-16 長度上限截字（同服務端 .length 校驗一致），唔會切開代理對。 */
export function clipText(text: string, max: number): string {
  let out = "";
  for (const char of text) {
    if (out.length + char.length > max) break;
    out += char;
  }
  return out;
}
