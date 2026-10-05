/**
 * 語料展示層元數據：色調、簡稱、書脊題、類型行等原型寫死嘅逐語料字串，
 * 加期號標籤、萬字格式化。數字一律由數據層計，呢度只放唔喺上游數據入面嘅展示文案。
 */

import { isLatinDominant } from "./reader.ts";

/** 語料色塊：kapok 木棉紅、ink 墨藍、green 檔案綠（對應 global.css 嘅 .tone-*）。 */
export type CorpusTone = "kapok" | "ink" | "green";

export interface CorpusMeta {
  tone: CorpusTone;
  /** 檢索 KWIC、篩選 pill、關於頁時間軸用嘅簡稱。 */
  shortTitle: string;
  /** 書目庫書脊卡豎排書名。 */
  spineTitle: string;
  /** 書名語種：zh 用大字號、en 用細一級字號。 */
  script: "zh" | "en";
  /** 首頁主打卡年份旁嘅紀年行；冇就 null。 */
  era: string | null;
  /** 類型行：多期「方言報紙 · 4 期」、單冊「單冊 · 粵英對照」。 */
  kind: string;
}

interface KnownMeta {
  tone: CorpusTone;
  shortTitle: string;
  spineTitle: string;
  script: "zh" | "en";
  era: string | null;
  genre: string;
}

/** 原型（design handoff）逐語料寫死嘅展示字串。 */
const KNOWN: Record<string, KnownMeta> = {
  "gd-vernacular-paper": {
    tone: "kapok",
    shortTitle: "廣東白話報",
    spineTitle: "廣東白話報",
    script: "zh",
    era: "光緒三十三年 · 丁未",
    genre: "方言報紙",
  },
  "canton-vernacular-handbook": {
    tone: "ink",
    shortTitle: "Canton Vernacular Handbook",
    spineTitle: "Canton Vernacular",
    script: "en",
    era: null,
    genre: "粵英對照",
  },
  "readings-in-cantonese-colloquial": {
    tone: "green",
    shortTitle: "Readings in Cantonese Colloquial",
    spineTitle: "Cantonese Colloquial",
    script: "en",
    era: null,
    genre: "粵英對照",
  },
};

const TONE_CYCLE: readonly CorpusTone[] = ["kapok", "ink", "green"];

/** 類型行：多期「{genre} · N 期」，單冊「單冊 · {genre}」；冇 genre 就淨係期數或「單冊」。 */
function kindLine(genre: string | null, issueCount: number): string {
  if (issueCount > 1) return genre ? `${genre} · ${issueCount} 期` : `${issueCount} 期`;
  return genre ? `單冊 · ${genre}` : "單冊";
}

/**
 * 語料展示元數據。未登記嘅 slug 用後備：色調按 index 輪替，簡稱同書脊題用原書名，
 * 書名語種按拉丁字母佔比判斷。
 */
export function corpusMeta(
  corpus: { slug: string; title: string; issueCount: number },
  index = 0,
): CorpusMeta {
  const known = KNOWN[corpus.slug];
  if (known) {
    const { genre, ...rest } = known;
    return { ...rest, kind: kindLine(genre, corpus.issueCount) };
  }
  return {
    tone: TONE_CYCLE[Math.abs(index) % TONE_CYCLE.length],
    shortTitle: corpus.title,
    spineTitle: corpus.title,
    script: isLatinDominant(corpus.title) ? "en" : "zh",
    era: null,
    kind: kindLine(null, corpus.issueCount),
  };
}

const DIGITS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

/** 1 至 99 轉中文數字（十一、二十、九十九）；範圍外照出阿拉伯數字。 */
export function chineseNumeral(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 99) return String(n);
  if (n < 10) return DIGITS[n];
  const tens = Math.floor(n / 10);
  return `${tens === 1 ? "" : DIGITS[tens]}十${DIGITS[n % 10]}`;
}

/** issue slug 尾嘅期數（issue-05 → 5）；冇數字返回 null。 */
function issueNumber(issue: string): number | null {
  const match = /(\d+)$/u.exec(issue);
  return match ? Number(match[1]) : null;
}

/** 期號短標（閱讀頁期號切換）：issue-05 → 五；冇數字照出 slug。 */
export function issueNumeral(issue: string): string {
  const n = issueNumber(issue);
  return n === null ? issue : chineseNumeral(n);
}

/** 期號標籤：單冊語料（issueCount ≤ 1）→「單冊」；多期 issue-01 →「第一期」；冇數字照出 slug。 */
export function issueLabel(issueCount: number, issue: string): string {
  if (issueCount <= 1) return "單冊";
  const n = issueNumber(issue);
  return n === null ? issue : `第${chineseNumeral(n)}期`;
}

/** 萬字格式：666143 → "66.6"（同 percent() 一樣無條件捨去到一位小數）。 */
export function formatWan(n: number): string {
  return String(Math.floor(n / 1000) / 10);
}
