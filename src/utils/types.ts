/**
 * 站點數據層型別：對應 scripts/sync-corpus.mjs 的產物（src/data/generated/）。
 * 上游新增字段一律忽略，故此處只聲明本站消費的字段。
 */

/** 文章塊：一篇文章的主體，id 當不透明鍵。 */
export interface ArticleBlock {
  type: "article";
  id: string;
  title: string | null;
  seq: number;
  text: string;
  text_norm: string;
}

/** 標記塊：整段版面標記（［插圖］［空白頁］［現代襯頁］等）。 */
export interface MarkerBlock {
  type: "marker";
  text: string;
}

export type PageBlock = ArticleBlock | MarkerBlock;

/** 頁文件中的一頁；status 由上游頁級狀態傳播而來。 */
export interface PageDocument {
  page: number;
  status: string;
  blocks: PageBlock[];
}

/** 語料層級摘要（manifest.json）。 */
export interface CorpusSummary {
  slug: string;
  title: string;
  year: number | null;
  issueCount: number;
  pageCount: number;
  articleCount: number;
  verifiedPages: number;
  needsReviewPages: number;
  sourceLine: string;
}

/** 期號層級摘要（<corpus>/issues.json）。 */
export interface IssueSummary {
  corpus: string;
  issue: string;
  issue_date: string | null;
  date_note: string | null;
  pages: number;
  articles: number;
  verified_pages: number;
  needs_review_pages: number;
}

/** manifest.json 全檔。 */
export interface Manifest {
  generated_at: string;
  corpora: CorpusSummary[];
}

/** 粵拼音表條目：[字在正文中的下標（碼點計）, 字, 粵拼]。 */
export type JyutpingEntry = [number, string, string];

/** 音表：文章 id → 讀音條目（<corpus>/<issue>/jyutping.json）。 */
export type JyutpingTable = Record<string, JyutpingEntry[]>;

/** 今譯條目：與本站正文段一一對應的譯文（標記段略去），加譯註數量。 */
export interface TranslationEntry {
  paragraphs: string[];
  note_count: number;
}

/** 今譯表：文章 id → 譯文（<corpus>/<issue>/translations.json）。 */
export type TranslationTable = Record<string, TranslationEntry>;
