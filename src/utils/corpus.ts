/**
 * 站點數據層讀取：語料清單、期號、葉文件。
 * 數據由 scripts/sync-corpus.mjs 生成，已提交 git（見 src/data/generated/README.md）。
 */

import manifestJson from "../data/generated/manifest.json";

import type { CorpusSummary, IssueSummary, JyutpingTable, Manifest, PageDocument } from "./types.ts";

export type { CorpusSummary, IssueSummary, JyutpingTable, PageDocument } from "./types.ts";

interface JsonModule<T> {
  default: T;
}

function moduleData<T>(module: JsonModule<T> | T): T {
  return (module as JsonModule<T>).default ?? (module as T);
}

const ISSUE_KEY = /generated\/([^/]+)\/issues\.json$/u;
const PAGE_KEY = /generated\/([^/]+)\/([^/]+)\/pages\.json$/u;
const JYUTPING_KEY = /generated\/([^/]+)\/([^/]+)\/jyutping\.json$/u;

const issueModules = import.meta.glob("../data/generated/*/issues.json", { eager: true }) as Record<
  string,
  JsonModule<IssueSummary[]>
>;
const pageModules = import.meta.glob("../data/generated/*/*/pages.json", {
  eager: true,
}) as Record<string, JsonModule<PageDocument[]>>;
const jyutpingModules = import.meta.glob("../data/generated/*/*/jyutping.json", {
  eager: true,
}) as Record<string, JsonModule<JyutpingTable>>;

const issuesByCorpus = new Map<string, IssueSummary[]>();
for (const [key, module] of Object.entries(issueModules)) {
  const match = ISSUE_KEY.exec(key);
  if (match?.[1]) issuesByCorpus.set(match[1], moduleData(module));
}

const pagesByIssue = new Map<string, PageDocument[]>();
for (const [key, module] of Object.entries(pageModules)) {
  const match = PAGE_KEY.exec(key);
  if (match?.[1] && match[2]) pagesByIssue.set(`${match[1]}/${match[2]}`, moduleData(module));
}

const jyutpingByIssue = new Map<string, JyutpingTable>();
for (const [key, module] of Object.entries(jyutpingModules)) {
  const match = JYUTPING_KEY.exec(key);
  if (match?.[1] && match[2]) jyutpingByIssue.set(`${match[1]}/${match[2]}`, moduleData(module));
}

const manifest = manifestJson as Manifest;

/** 語料清單，順序即 manifest 登記順序。 */
export function getCorpora(): CorpusSummary[] {
  return manifest.corpora;
}

export function getCorpus(slug: string): CorpusSummary | undefined {
  return manifest.corpora.find((corpus) => corpus.slug === slug);
}

/** 語料的期號清單；期號缺失時返回空陣列（呼叫方自行處理）。 */
export function getIssues(slug: string): IssueSummary[] {
  return issuesByCorpus.get(slug) ?? [];
}

export function getIssue(slug: string, issue: string): IssueSummary | undefined {
  return getIssues(slug).find((record) => record.issue === issue);
}

/** 某期的全部葉，按掃描序號排列。 */
export function getPages(slug: string, issue: string): PageDocument[] {
  return pagesByIssue.get(`${slug}/${issue}`) ?? [];
}

export function getPage(slug: string, issue: string, page: number): PageDocument | undefined {
  return getPages(slug, issue).find((record) => record.page === page);
}

/** 某期的粵拼音表：文章 id → 讀音條目；冇音表時返回空物件（該期照舊唔注音）。 */
export function getJyutping(slug: string, issue: string): JyutpingTable {
  return jyutpingByIssue.get(`${slug}/${issue}`) ?? {};
}

export interface PageRoute {
  corpus: string;
  issue: string;
  page: number;
}

/** 全站葉級路由（閱讀器靜態生成的來源）。 */
export function getPageRoutes(): PageRoute[] {
  const routes: PageRoute[] = [];
  for (const corpus of manifest.corpora) {
    for (const issue of getIssues(corpus.slug)) {
      for (const page of getPages(corpus.slug, issue.issue)) {
        routes.push({ corpus: corpus.slug, issue: issue.issue, page: page.page });
      }
    }
  }
  return routes;
}

/** 全站合計，供首頁與書目庫展示。 */
export function getSiteTotals(): {
  corpusCount: number;
  issueCount: number;
  pageCount: number;
  articleCount: number;
  verifiedPages: number;
} {
  return manifest.corpora.reduce(
    (totals, corpus) => ({
      corpusCount: totals.corpusCount + 1,
      issueCount: totals.issueCount + corpus.issueCount,
      pageCount: totals.pageCount + corpus.pageCount,
      articleCount: totals.articleCount + corpus.articleCount,
      verifiedPages: totals.verifiedPages + corpus.verifiedPages,
    }),
    { corpusCount: 0, issueCount: 0, pageCount: 0, articleCount: 0, verifiedPages: 0 },
  );
}
