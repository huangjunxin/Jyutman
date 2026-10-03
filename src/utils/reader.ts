/**
 * 閱讀器純函數：段落切分、字體分層判定、標記說明、狀態徽章、粵拼注音渲染。
 * 只做展示層推導，不改寫正文（原文逐字保留，見 docs/03）。
 */

import { isCjkIdeograph } from "./search-planner.ts";

export type { ArticleBlock, JyutpingEntry, JyutpingTable, MarkerBlock, PageBlock, PageDocument } from "./types.ts";

import type { JyutpingEntry } from "./types.ts";

/** 拉丁字母佔比達到此閾值的段落按羅馬字層排印（等寬）。 */
export const LATIN_RATIO_THRESHOLD = 0.5;

/** 整段版面標記：如 ［插圖］［空白頁］［現代襯頁］。 */
export const MARKER_PATTERN = /^［[^］]+］$/u;

/** 段落連它在正文中的起始下標（碼點計）；粵拼注音按正文字元下標對表。 */
export interface ParagraphSpan {
  text: string;
  start: number;
}

/** 拆段並記低每段在正文中的起始下標；分段規則與 splitParagraphs 一致。 */
export function splitParagraphSpans(text: string): ParagraphSpan[] {
  const spans: ParagraphSpan[] = [];
  let cursor = 0;
  for (const paragraph of text.split("\n\n")) {
    const chars = [...paragraph];
    const start = cursor;
    cursor += chars.length + 2;
    let from = 0;
    let to = chars.length;
    while (from < to && /\s/u.test(chars[from])) from += 1;
    while (to > from && /\s/u.test(chars[to - 1])) to -= 1;
    if (from === to) continue;
    spans.push({ text: chars.slice(from, to).join(""), start: start + from });
  }
  return spans;
}

/** 拆段：塊內以空行分段，段首尾空白不進正文。 */
export function splitParagraphs(text: string): string[] {
  return splitParagraphSpans(text).map((span) => span.text);
}

/** 句末標點：漢文句末標點（。！？；…）加收尾引號（」』），另收英文 . ! ? ;。 */
const SENTENCE_END = /[。！？；…」』.!?;]/u;

/** 收尾符號：句末標點之後仲可以有收尾括號或引號。 */
const TRAILING_CLOSER = /[」』）)\]"'’”]/u;

/** 段末是否句末標點；段末收尾引號／括號先跳過，再睇前一個字。 */
export function endsWithSentenceEnd(text: string): boolean {
  const chars = [...text.trim()];
  let end = chars.length - 1;
  while (end >= 0 && TRAILING_CLOSER.test(chars[end]) && !SENTENCE_END.test(chars[end])) end -= 1;
  return end >= 0 && SENTENCE_END.test(chars[end]);
}

/** 詞字元：字母、數字、附標記（標點與空白唔算）。 */
const WORD_CHAR = /[\p{L}\p{N}\p{M}]/u;

/** 拉丁詞字元（字母、數字、附標記）；漢字唔算，令漢字段之間直接連排。 */
function isLatinWordChar(char: string | undefined): boolean {
  if (char === undefined || isCjkIdeograph(char)) return false;
  return WORD_CHAR.test(char);
}

/** 由尾向前搵第一個詞字元，跳過標點與空白。 */
function lastWordChar(text: string): string | undefined {
  const chars = [...text.trim()];
  for (let i = chars.length - 1; i >= 0; i -= 1) {
    if (WORD_CHAR.test(chars[i])) return chars[i];
  }
  return undefined;
}

/** 由頭向後搵第一個詞字元，跳過標點與空白。 */
function firstWordChar(text: string): string | undefined {
  for (const char of text.trim()) {
    if (WORD_CHAR.test(char)) return char;
  }
  return undefined;
}

/** 段與段之間嘅連接：邊界有拉丁詞字元就補一個空格，漢字之間直接連排。 */
export function paragraphJoin(previous: string, next: string): string {
  return isLatinWordChar(lastWordChar(previous)) || isLatinWordChar(firstWordChar(next)) ? " " : "";
}

/** 連排之後嘅段落：spans 為組成佢嘅原文切片（各自帶正文章節下標）。 */
export interface MergedParagraph {
  /** 連排文字（段落之間按連接規則補位），用於羅馬字層判定。 */
  text: string;
  spans: ParagraphSpan[];
}

/**
 * 版面合併：相鄰段若前一段末冇句末標點，就唔分段、直接連排（visual merge，唔改數據）。
 * 音表下標仍按各原文切片計，故合併唔影響注音。
 */
export function mergeParagraphSpans(spans: readonly ParagraphSpan[]): MergedParagraph[] {
  const merged: MergedParagraph[] = [];
  for (const span of spans) {
    const previous = merged.at(-1);
    if (previous !== undefined && !endsWithSentenceEnd(previous.text)) {
      previous.text += paragraphJoin(previous.text, span.text) + span.text;
      previous.spans.push(span);
    } else {
      merged.push({ text: span.text, spans: [span] });
    }
  }
  return merged;
}

/**
 * 連排段落嘅 HTML：逐片按各自正文章節下標注音，再按連接規則拼埋；
 * 拉丁為主嘅切片包一層 .rom（等寬層），令連排之後嘅漢字仍然用襯線正文。
 */
export function renderMergedParagraph(
  paragraph: MergedParagraph,
  readings: ReadonlyMap<number, string>,
): string {
  let html = "";
  let previous = "";
  for (const span of paragraph.spans) {
    if (previous !== "") html += paragraphJoin(previous, span.text);
    const inner = renderAnnotatedParagraph(span.text, span.start, readings);
    html += isLatinDominant(span.text) ? `<span class="rom">${inner}</span>` : inner;
    previous = span.text;
  }
  return html;
}

/** 音表條目轉查表：正文下標 → 粵拼。 */
export function readingsByIndex(entries: readonly JyutpingEntry[] | undefined): Map<number, string> {
  const readings = new Map<number, string>();
  for (const entry of entries ?? []) readings.set(entry[0], entry[2]);
  return readings;
}

function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/**
 * 把段落渲染成 HTML：漢字包成 <ruby>字<rt>粵拼</rt></ruby>，標點、拉丁與 □ 唔注。
 * 冇音表或者該字冇讀音時照舊輸出；□ 保留缺字樣式，只加樣式不改字。
 */
export function renderAnnotatedParagraph(
  text: string,
  start: number,
  readings: ReadonlyMap<number, string>,
): string {
  let html = "";
  let offset = 0;
  for (const char of text) {
    const reading = isCjkIdeograph(char) ? readings.get(start + offset) : undefined;
    offset += 1;
    if (reading !== undefined) {
      html += `<ruby>${escapeHtml(char)}<rt>${escapeHtml(reading)}</rt></ruby>`;
    } else if (char === "□") {
      html += '<span class="miss" title="未辨識字">□</span>';
    } else {
      html += escapeHtml(char);
    }
  }
  return html;
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
