/**
 * 閱讀頁展示層純函數：帶正文下標嘅段落 HTML、今譯譯註、檢索高亮區間、報錯區間同前後文。
 * 構建期（頁面 frontmatter）同瀏覽器端（閱讀頁 <script>）共用；唔掂 DOM，方便 node:test 直接測。
 */

import { normalize } from "./normalize.ts";
import { escapeHtml, paragraphJoin, renderAnnotatedParagraph, type MergedParagraph } from "./reader.ts";
import { normalizeWithMap } from "./search-planner.ts";

/** 報錯問題類型：閱讀頁 chips 同 POST /api/correct 校驗共用（server/routes/corrections.ts 轉出）。 */
export const CORRECTION_TYPES = ["錯字", "缺字", "標點分段", "今譯疑問", "其他"] as const;

/** 手機端預設橫排嘅媒體查詢：未儲存顯式行款偏好時，此寬度以下預設橫排、以上預設豎排。 */
export const MOBILE_LAYOUT_QUERY = "(max-width: 767px)";

/** 按已儲存嘅行款偏好同螢幕寬度決定實際行款；冇顯式儲存（或非法值）時，手機端橫排、桌面端豎排。 */
export function resolveReaderLayout(saved: unknown, isMobile: boolean): "vertical" | "horizontal" {
  if (saved === "horizontal" || saved === "vertical") return saved;
  return isMobile ? "horizontal" : "vertical";
}

/**
 * 連排段落 HTML：逐片按各自正文下標注音、按規則連接，
 * 每片包一層 <span data-o="正文下標">，瀏覽器端揀字時可以換算返正文碼點區間。
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

/** 前後文：選區前文取尾 radius 個碼點、後文取頭 radius 個碼點（按選區位置切，唔靠搜尋，重複字唔會走位）。 */
export function fragmentAround(before: string, text: string, after: string, radius = 20): string {
  return [...before].slice(-radius).join("") + text + [...after].slice(0, radius).join("");
}

export interface Point2D {
  x: number;
  y: number;
}

export interface BoxRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * 字典浮卡滑鼠保持區判定：
 * - 浮卡未彈出（cardRect 為 null）時：滑鼠喺點擊點 10px 曼哈頓距離之內先繼續等 300ms；
 * - 浮卡已顯示（cardRect 非空）時：連接點擊點（±12px）同浮卡（±16px）嘅外包矩形之內都保持顯示，
 *   令用戶可以從所點字平滑移入浮卡撳連結，離開過渡帶或浮卡即收起。
 */
export function isPointInDictKeepZone(
  point: Point2D,
  anchor: Point2D,
  cardRect: BoxRect | null,
  { preOpenRadius = 10, anchorPad = 12, cardPad = 16 } = {},
): boolean {
  if (cardRect === null) {
    return Math.abs(point.x - anchor.x) + Math.abs(point.y - anchor.y) <= preOpenRadius;
  }
  const left = Math.min(anchor.x - anchorPad, cardRect.left - cardPad);
  const right = Math.max(anchor.x + anchorPad, cardRect.right + cardPad);
  const top = Math.min(anchor.y - anchorPad, cardRect.top - cardPad);
  const bottom = Math.max(anchor.y + anchorPad, cardRect.bottom + cardPad);
  return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
}

/**
 * 按上下文 fragment 與所選文字 selectedText 喺目標區塊全文 text 內定位 UTF-16 高亮區間。
 * 用於無 span_start/span_end 嘅上報（篇名、今譯或舊正文上報）：有 fragment 時須先對中 fragment，
 * 再喺其區間內定位 selectedText，避免誤標其他區域碰巧相同嘅字；僅當 fragment 為空時退回搵第一處。
 */
export function findReportRanges(text: string, selectedText: string, fragment: string): [number, number][] {
  if (text === "" || selectedText === "") return [];
  if (fragment.trim() === "") return highlightRanges(text, selectedText).slice(0, 1);
  for (const [fragStart, fragEnd] of highlightRanges(text, fragment)) {
    const inner = highlightRanges(text.slice(fragStart, fragEnd), selectedText);
    if (inner.length > 0) {
      return [[fragStart + inner[0][0], fragStart + inner[0][1]]];
    }
  }
  return [];
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
