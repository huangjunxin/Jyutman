/**
 * 閱讀器純函數：段落切分、字體分層判定、標記說明、狀態徽章。
 * 只做展示層推導，不改寫正文（原文逐字保留，見 docs/03）。
 */

export type { ArticleBlock, MarkerBlock, PageBlock, PageDocument } from "./types.ts";

/** 拉丁字母佔比達到此閾值的段落按羅馬字層排印（等寬）。 */
export const LATIN_RATIO_THRESHOLD = 0.5;

/** 整段版面標記：如 ［插圖］［空白頁］［現代襯頁］。 */
export const MARKER_PATTERN = /^［[^］]+］$/u;

/** 拆段：塊內以空行分段，段首尾空白不進正文。 */
export function splitParagraphs(text: string): string[] {
  const paragraphs = [];
  for (const paragraph of text.split("\n\n")) {
    const trimmed = paragraph.trim();
    if (trimmed !== "") paragraphs.push(trimmed);
  }
  return paragraphs;
}

/** 拉丁字母在可見字符中的佔比；空白不計。 */
export function latinRatio(text: string): number {
  const letters = (text.match(/[A-Za-z]/gu) ?? []).length;
  const visible = text.replace(/\s+/gu, "").length;
  return visible === 0 ? 0 : letters / visible;
}

/** 拉丁字符為主的段落（英文原文、傳教士羅馬字）改用等寬字排印。 */
export function isLatinDominant(text: string): boolean {
  return latinRatio(text) >= LATIN_RATIO_THRESHOLD;
}

/** 版面標記的說明文字；未登記的標記只照錄原文，不強作解釋。 */
export function markerNote(marker: string): string | null {
  switch (marker) {
    case "［插圖］":
      return "底本此處為插圖，影像待版權核查後開放。";
    case "［空白頁］":
      return "掃描確認為空白葉。";
    case "［現代襯頁］":
      return "現代掃描襯頁，非底本內容。";
    default:
      return null;
  }
}

export type StatusTone = "ok" | "done" | "ocr";

export interface StatusBadge {
  label: string;
  tone: StatusTone;
}

/**
 * 上游 status 到徽章的映射：verified 為已核驗；
 * draft / needs_review 及未知值一律按未校呈現（見 docs/04 第 3.3 節）。
 * 已校（done）只由本站校對通道產生，Phase 1 不會出現。
 */
export function statusBadge(status: string): StatusBadge {
  if (status === "verified") return { label: "已核驗", tone: "ok" };
  return { label: "OCR 未校", tone: "ocr" };
}

/** 葉碼在 URL 與展示中一律三位補零（掃描序號，永遠連續）。 */
export function pageParam(page: number): string {
  return String(page).padStart(3, "0");
}

/** 百分比（0 至 100，保留一位小數），用於校對進度條。 */
export function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.floor((part / total) * 1000) / 10;
}
