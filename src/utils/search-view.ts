/**
 * 檢索頁（src/pages/search/index.astro）展示層純函數：模式標籤、歸一提示、
 * 命中連結、篩選 pill、期號欄、檢索 URL。後端只做漢字／英文全文檢索，冇粵拼檢索。
 */

import { issueLabel } from "./corpus-meta.ts";
import { pageParam } from "./reader.ts";
import { isCjkIdeograph } from "./search-planner.ts";

/** 有漢字就係「漢字檢索」，否則「英文全文檢索」。 */
export function searchModeLabel(query: string): string {
  return [...query].some(isCjkIdeograph) ? "漢字檢索" : "英文全文檢索";
}

/**
 * 歸一提示：API 回嘅 normalized 同輸入（去晒空白）唔同先出，例如「广东」→「廣東」；
 * 只係去空白或者冇變就返回 null。
 */
export function normalizationNotice(query: string, normalized: string): string | null {
  if (normalized === "" || normalized === query.replace(/\s+/gu, "")) return null;
  return `已將「${query.trim()}」歸一為「${normalized}」檢索；下面照樣顯示底本原字。`;
}

/** 命中連去葉級 URL，帶 ?hl= 查詢字同文章錨點。 */
export function hitHref(
  hit: { corpus: string; issue: string; page: number; id?: string | null },
  query: string,
): string {
  const hash = hit.id ? `#${hit.id}` : "";
  return `/read/${hit.corpus}/${hit.issue}/${pageParam(hit.page)}/?hl=${encodeURIComponent(query)}${hash}`;
}

/** 檢索頁 URL：冇查詢字就係 /search/；corpus 為單選篩選。 */
export function searchHref(query: string, corpus: string | null = null): string {
  if (query === "") return "/search/";
  const params = new URLSearchParams({ q: query });
  if (corpus) params.set("corpus", corpus);
  return `/search/?${params}`;
}

export interface FacetPill {
  /** null 即「全部」。 */
  slug: string | null;
  label: string;
  count: number;
}

/**
 * 篩選 pill：「全部」（各語料篇數加埋）＋有命中嘅語料（按 corpora 次序）；
 * 已選中嘅語料就算冇命中都照列，等用戶撳得返走。
 */
export function facetPills(
  corpora: readonly { slug: string; shortTitle: string }[],
  facets: Readonly<Record<string, number>>,
  selected: string | null,
): FacetPill[] {
  const total = Object.values(facets).reduce((sum, n) => sum + n, 0);
  return [
    { slug: null, label: "全部", count: total },
    ...corpora
      .filter((corpus) => (facets[corpus.slug] ?? 0) > 0 || corpus.slug === selected)
      .map((corpus) => ({ slug: corpus.slug, label: corpus.shortTitle, count: facets[corpus.slug] ?? 0 })),
  ];
}

/** KWIC 資料行嘅期號欄：單冊語料出年份（冇年份就「單冊」），多期出「第N期」。 */
export function hitIssueLabel(
  corpus: { issueCount: number; year: number | null } | undefined,
  issue: string,
): string {
  if (corpus && corpus.issueCount <= 1 && corpus.year !== null) return String(corpus.year);
  return issueLabel(corpus?.issueCount ?? 2, issue);
}
