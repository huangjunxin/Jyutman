#!/usr/bin/env node
/**
 * 語料同步：讀上游 JyutmanDataPipeline 發佈層 jsonl，產出本站數據層與 D1 匯入 SQL。
 *
 * 派生數據，可由 scripts/sync-corpus.mjs 重建；產物已提交 git，CI 不依賴上游管道。
 *
 * 用法：node scripts/sync-corpus.mjs [--data-root <上游 data 目錄>]
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { normalize } from "../src/utils/normalize.ts";
import { segmentNgrams } from "../src/utils/search-planner.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const DEFAULT_DATA_ROOT = path.resolve(REPO_ROOT, "..", "JyutmanDataPipeline", "data");
const OUT_ROOT = path.join(REPO_ROOT, "src", "data", "generated");
const SQL_PATH = path.join(REPO_ROOT, "db", "import.sql");

/** 派生數據目錄的說明檔；由本腳本一併生成，避免全量重建時被清走。 */
const DATA_README = `# 派生數據

本目錄全部係派生數據，可由 \`scripts/sync-corpus.mjs\` 重建（讀上游 \`JyutmanDataPipeline/data/<corpus>/*.jsonl\` 發佈層）：

- \`manifest.json\`：語料級摘要（標題照錄底本原名、年代、葉數、篇數、校對進度、掃描來源）。
- \`<corpus>/issues.json\`：期號清單（日期、考證說明、葉數、篇數、已核驗與待校葉數）。
- \`<corpus>/<issue>/pages.json\`：葉級頁面數據，每葉 \`{page, status, blocks}\`；\`blocks\` 由文章切分而來，\`type\` 為 \`article\`（\`id\` / \`title\` / \`seq\` / \`text\` / \`text_norm\`）或 \`marker\`（整段版面標記，如 ［插圖］［空白頁］［現代襯頁］）。

重建指令：\`node scripts/sync-corpus.mjs\`。請勿手改本目錄任何文件；上游字段語義與容錯見 \`docs/03-data-contract.md\`。
`;

/** 語料順序即站點展示順序；title 照錄底本原名，sourceLine 記掃描來源。 */
export const CORPUS_META = {
  "gd-vernacular-paper": {
    title: "廣東白話報",
    year: null,
    sourceLine: "底本影像為網絡流傳之數碼副本（原始掃描機構待考）",
  },
  "canton-vernacular-handbook": {
    title: "A Handbook of the Canton Vernacular of the Chinese Language",
    year: 1874,
    sourceLine: "Internet Archive · Cornell University Library 藏",
  },
  "readings-in-cantonese-colloquial": {
    title: "Readings in Cantonese Colloquial",
    year: 1894,
    sourceLine: "Internet Archive · Cornell University Library 藏",
  },
};

export const CORPUS_ORDER = Object.keys(CORPUS_META);

/** 整段版面標記（如 ［插圖］［空白頁］［現代襯頁］）由正文抽出為獨立塊。 */
const MARKER_PATTERN = /^［[^］]+］$/u;

/** 單條 INSERT 的字節預算：D1 對單條語句限制 100 KB，取三分之一留足餘量。 */
const SQL_STATEMENT_BUDGET = 32_000;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value) {
  return typeof value === "string" && value !== "";
}

function asCount(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function asNullableText(value) {
  return isText(value) ? value : null;
}

/** 逐行解析 jsonl；解析失敗的行計入 skipped，不中斷整批（見 docs/03 第 9 節）。 */
export function parseJsonl(raw) {
  const records = [];
  let skipped = 0;
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    try {
      records.push(JSON.parse(trimmed));
    } catch {
      skipped += 1;
    }
  }
  return { records, skipped };
}

/**
 * 校驗並裁剪單篇文章。未知字段一律忽略；缺必需字段返回 null。
 * ID 當不透明鍵，不解析格式（見 docs/03 坑清單 ④）。
 */
export function pickArticle(record) {
  if (!isRecord(record)) return null;
  if (!isText(record.id) || !isText(record.corpus) || !isText(record.issue)) return null;
  if (!Number.isInteger(record.page) || !Number.isInteger(record.seq)) return null;
  if (typeof record.text !== "string") return null;
  return {
    id: record.id,
    corpus: record.corpus,
    issue: record.issue,
    issue_date: asNullableText(record.issue_date),
    page: record.page,
    seq: record.seq,
    title: asNullableText(record.title),
    text: record.text,
    status: isText(record.status) ? record.status : "draft",
  };
}

/** 校驗並裁剪單葉記錄；status 由此傳播到葉級展示（見 docs/03 坑清單 ②）。 */
export function pickPage(record) {
  if (!isRecord(record)) return null;
  if (!isText(record.corpus) || !isText(record.issue)) return null;
  if (!Number.isInteger(record.page)) return null;
  return {
    corpus: record.corpus,
    issue: record.issue,
    issue_date: asNullableText(record.issue_date),
    page: record.page,
    text: typeof record.text === "string" ? record.text : "",
    articles: asCount(record.articles),
    status: isText(record.status) ? record.status : "draft",
  };
}

/** 校驗並裁剪單期記錄；date_note 屬研究性內容，保留展示（見 docs/03 第 4.2 節）。 */
export function pickIssue(record) {
  if (!isRecord(record)) return null;
  if (!isText(record.corpus) || !isText(record.issue)) return null;
  return {
    corpus: record.corpus,
    issue: record.issue,
    issue_date: asNullableText(record.issue_date),
    date_note: asNullableText(record.date_note),
    pages: asCount(record.pages),
    articles: asCount(record.articles),
    verified_pages: asCount(record.verified_pages),
    needs_review_pages: asCount(record.needs_review_pages),
  };
}

/** 切分文章正文：整段標記抽為 markers，其餘段落合成 body，逐字保留原文。 */
export function splitArticleText(text) {
  const body = [];
  const markers = [];
  for (const paragraph of text.split("\n\n")) {
    const trimmed = paragraph.trim();
    if (trimmed === "") continue;
    if (MARKER_PATTERN.test(trimmed)) {
      markers.push(trimmed);
    } else {
      body.push(trimmed);
    }
  }
  return { body: body.join("\n\n"), markers };
}

/**
 * 由葉記錄與該葉文章生成 blocks。
 * 文章塊按 seq 排序；標記塊跟在所屬文章塊之後；text_norm 為檢索輔助字段。
 */
export function buildPageRecord(page, articles) {
  const blocks = [];
  for (const article of [...articles].sort((a, b) => a.seq - b.seq)) {
    const { body, markers } = splitArticleText(article.text);
    if (body !== "" || article.title !== null) {
      blocks.push({
        type: "article",
        id: article.id,
        title: article.title,
        seq: article.seq,
        text: body,
        text_norm: normalize(body),
      });
    }
    for (const marker of markers) {
      blocks.push({ type: "marker", text: marker });
    }
  }
  return { page: page.page, status: page.status, blocks };
}

/** 由期號日期推底本年代；全部日期待考時回退到語料登記值。 */
export function pickYear(issueDates, fallback) {
  const years = [];
  for (const value of issueDates) {
    const match = typeof value === "string" ? value.match(/\d{4}/u) : null;
    if (match) years.push(Number(match[0]));
  }
  if (years.length === 0) return fallback ?? null;
  return Math.min(...years);
}

function readJsonlFile(filePath) {
  return parseJsonl(readFileSync(filePath, "utf8"));
}

function assertSafeSegment(value, label) {
  if (value.includes("/") || value.includes("\\") || value === "." || value === "..") {
    throw new Error(`上游 ${label} 含不安全路徑字符：${JSON.stringify(value)}`);
  }
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sqlText(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlInteger(value) {
  return Number.isInteger(value) ? String(value) : "NULL";
}

function insertStatement(table, columns, rows) {
  const lines = rows.map((row) => `  (${row.join(", ")})`);
  return `INSERT INTO ${table} (${columns.join(", ")}) VALUES\n${lines.join(",\n")};\n`;
}

/** 行內字段的 UTF-8 字節數加分隔符，用於分批。 */
function rowCost(row) {
  return row.reduce((total, value) => total + Buffer.byteLength(String(value), "utf8") + 4, 0);
}

/** 按行長把行分批，令每條 INSERT 落在預算之內。 */
export function chunkRows(rows, budget = SQL_STATEMENT_BUDGET) {
  const chunks = [];
  let current = [];
  let cost = 0;
  for (const row of rows) {
    const next = rowCost(row);
    if (current.length > 0 && cost + next > budget) {
      chunks.push(current);
      current = [];
      cost = 0;
    }
    current.push(row);
    cost += next;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/** 生成 D1 建表與灌數 SQL：trigram 主索引 + bigram / unigram 短查詢輔助表。 */
export function buildImportSql({ articles, issues }) {
  const parts = [];
  parts.push(`-- 派生數據，可由 scripts/sync-corpus.mjs 重建。
-- 生產 D1（jyutman）建表與灌數用；檢索方案實測見 docs/spikes/0.1-d1-trigram.md：
-- trigram 可用，故啟用 articles_fts；bigram / unigram 輔助表供 2 字與 1 字查詢降級。
-- 一次性全量導入空庫：npx wrangler d1 execute jyutman --remote --file db/import.sql
-- 重跑會撞 articles 主鍵（id 重複）而中途報錯，要先清庫或重建數據庫。

CREATE TABLE IF NOT EXISTS articles (
  id          TEXT PRIMARY KEY,
  corpus      TEXT NOT NULL,
  issue       TEXT NOT NULL,
  issue_date  TEXT,
  page        INTEGER NOT NULL,
  seq         INTEGER NOT NULL,
  title       TEXT,
  text        TEXT NOT NULL,
  text_norm   TEXT NOT NULL,
  status      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_articles_corpus_issue_page
  ON articles (corpus, issue, page);

CREATE TABLE IF NOT EXISTS issues (
  corpus             TEXT NOT NULL,
  issue              TEXT NOT NULL,
  issue_date         TEXT,
  date_note          TEXT,
  pages              INTEGER NOT NULL,
  articles           INTEGER NOT NULL,
  verified_pages     INTEGER NOT NULL,
  needs_review_pages INTEGER NOT NULL,
  PRIMARY KEY (corpus, issue)
);

-- 主索引：trigram（3 字及以上整串短語 MATCH）
CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
  id UNINDEXED, title, text_norm, tokenize = 'trigram'
);

-- 降級索引：bigram 供 2 字查詢，unigram 供 1 字查詢；seg 為構建期切好的空格分隔 n-gram 串
CREATE VIRTUAL TABLE IF NOT EXISTS articles_bigram_fts USING fts5(
  id UNINDEXED, seg, tokenize = 'unicode61'
);
CREATE VIRTUAL TABLE IF NOT EXISTS articles_unigram_fts USING fts5(
  id UNINDEXED, seg, tokenize = 'unicode61'
);

`);

  const articleRows = articles.map((a) => [
    sqlText(a.id),
    sqlText(a.corpus),
    sqlText(a.issue),
    sqlText(a.issue_date),
    sqlInteger(a.page),
    sqlInteger(a.seq),
    sqlText(a.title),
    sqlText(a.text),
    sqlText(a.text_norm),
    sqlText(a.status),
  ]);
  const articleColumns = [
    "id",
    "corpus",
    "issue",
    "issue_date",
    "page",
    "seq",
    "title",
    "text",
    "text_norm",
    "status",
  ];
  for (const chunk of chunkRows(articleRows)) {
    parts.push(insertStatement("articles", articleColumns, chunk));
  }

  // FTS 灌數必須排在 articles 之後（主索引由基表整批導入）。
  parts.push(`INSERT INTO articles_fts (id, title, text_norm)
  SELECT id, title, text_norm FROM articles;
`);

  const bigramRows = [];
  const unigramRows = [];
  for (const article of articles) {
    const bigram = segmentNgrams(article.text_norm, 2);
    if (bigram !== "") bigramRows.push([sqlText(article.id), sqlText(bigram)]);
    const unigram = segmentNgrams(article.text_norm, 1);
    if (unigram !== "") unigramRows.push([sqlText(article.id), sqlText(unigram)]);
  }
  for (const chunk of chunkRows(bigramRows)) {
    parts.push(insertStatement("articles_bigram_fts", ["id", "seg"], chunk));
  }
  for (const chunk of chunkRows(unigramRows)) {
    parts.push(insertStatement("articles_unigram_fts", ["id", "seg"], chunk));
  }

  const issueRows = issues.map((issue) => [
    sqlText(issue.corpus),
    sqlText(issue.issue),
    sqlText(issue.issue_date),
    sqlText(issue.date_note),
    sqlInteger(issue.pages),
    sqlInteger(issue.articles),
    sqlInteger(issue.verified_pages),
    sqlInteger(issue.needs_review_pages),
  ]);
  const issueColumns = [
    "corpus",
    "issue",
    "issue_date",
    "date_note",
    "pages",
    "articles",
    "verified_pages",
    "needs_review_pages",
  ];
  for (const chunk of chunkRows(issueRows)) {
    parts.push(insertStatement("issues", issueColumns, chunk));
  }

  return `${parts.join("\n")}`.replace(/\n{3,}/gu, "\n\n");
}

function syncCorpus(dataRoot, slug) {
  const meta = CORPUS_META[slug];
  const dir = path.join(dataRoot, slug);
  const articles = readJsonlFile(path.join(dir, "articles.jsonl"));
  const pages = readJsonlFile(path.join(dir, "pages.jsonl"));
  const issues = readJsonlFile(path.join(dir, "issues.jsonl"));

  const warnings = [];
  const warn = (message) => warnings.push(`${slug}: ${message}`);
  for (const [name, parsed] of [
    ["articles.jsonl", articles],
    ["pages.jsonl", pages],
    ["issues.jsonl", issues],
  ]) {
    if (parsed.skipped > 0) warn(`${name} 跳過 ${parsed.skipped} 行無法解析的記錄`);
  }

  const articleRecords = [];
  for (const record of articles.records) {
    const picked = pickArticle(record);
    if (picked === null) warn(`articles.jsonl 跳過字段不完整的記錄：${JSON.stringify(record).slice(0, 80)}`);
    else articleRecords.push(picked);
  }
  const pageRecords = [];
  for (const record of pages.records) {
    const picked = pickPage(record);
    if (picked === null) warn(`pages.jsonl 跳過字段不完整的記錄：${JSON.stringify(record).slice(0, 80)}`);
    else pageRecords.push(picked);
  }
  const issueRecords = [];
  for (const record of issues.records) {
    const picked = pickIssue(record);
    if (picked === null) warn(`issues.jsonl 跳過字段不完整的記錄：${JSON.stringify(record).slice(0, 80)}`);
    else issueRecords.push(picked);
  }

  const articlesByPage = new Map();
  for (const article of articleRecords) {
    const key = `${article.issue}\u0000${article.page}`;
    const list = articlesByPage.get(key);
    if (list) list.push(article);
    else articlesByPage.set(key, [article]);
  }

  const issueDocuments = [];
  const pageDocuments = [];
  const usedArticles = [];
  const sqlArticles = [];
  let verifiedPages = 0;
  let needsReviewPages = 0;

  for (const issue of issueRecords) {
    assertSafeSegment(issue.issue, "issue");
    const issuePages = pageRecords
      .filter((page) => page.issue === issue.issue)
      .sort((a, b) => a.page - b.page);
    if (issuePages.length === 0) warn(`期號 ${issue.issue} 沒有對應的葉記錄`);

    const document = [];
    for (const page of issuePages) {
      const list = articlesByPage.get(`${page.issue}\u0000${page.page}`) ?? [];
      if (list.length === 0) warn(`第 ${page.page} 葉沒有對應的文章記錄，正文可能缺失`);
      else if (page.articles !== 0 && list.length !== page.articles) {
        warn(`第 ${page.page} 葉文章數不一致：pages.jsonl 記 ${page.articles}，articles.jsonl 有 ${list.length}`);
      }
      const joined = list
        .slice()
        .sort((a, b) => a.seq - b.seq)
        .map((article) => article.text)
        .join("\n\n");
      if (page.text !== joined) warn(`第 ${page.page} 葉頁文本與文章拼接不一致，已以文章切分為準`);

      document.push(buildPageRecord(page, list));
      for (const article of list) {
        usedArticles.push(article);
        const { body } = splitArticleText(article.text);
        sqlArticles.push({ ...article, text: body, text_norm: normalize(body) });
      }
      if (page.status === "verified") verifiedPages += 1;
      else if (page.status === "needs_review" || page.status === "draft") needsReviewPages += 1;
    }

    issueDocuments.push(issue);
    pageDocuments.push({ issue: issue.issue, pages: document });
  }

  const orphanCount = articleRecords.length - usedArticles.length;
  if (orphanCount > 0) warn(`articles.jsonl 有 ${orphanCount} 篇不屬於任何已發佈葉，已略去`);

  return {
    slug,
    meta,
    issues: issueDocuments,
    pages: pageDocuments,
    articles: usedArticles,
    sqlArticles,
    verifiedPages,
    needsReviewPages,
    warnings,
  };
}

function main() {
  const argv = process.argv.slice(2);
  const dataRootIndex = argv.indexOf("--data-root");
  const dataRoot =
    dataRootIndex >= 0 && argv[dataRootIndex + 1]
      ? path.resolve(argv[dataRootIndex + 1])
      : process.env.JYUTMAN_DATA_ROOT
        ? path.resolve(process.env.JYUTMAN_DATA_ROOT)
        : DEFAULT_DATA_ROOT;

  console.log(`讀取上游發佈層：${dataRoot}`);
  const synced = CORPUS_ORDER.map((slug) => syncCorpus(dataRoot, slug));
  const warnings = synced.flatMap((corpus) => corpus.warnings);

  rmSync(OUT_ROOT, { recursive: true, force: true });
  mkdirSync(OUT_ROOT, { recursive: true });
  mkdirSync(path.dirname(SQL_PATH), { recursive: true });
  writeFileSync(path.join(OUT_ROOT, "README.md"), DATA_README);

  const corpora = synced.map((corpus) => {
    const issueCount = corpus.issues.length;
    const pageCount = corpus.pages.reduce((total, issue) => total + issue.pages.length, 0);
    const articleCount = corpus.articles.length;
    const year = pickYear(
      corpus.issues.map((issue) => issue.issue_date),
      corpus.meta.year,
    );
    return {
      slug: corpus.slug,
      title: corpus.meta.title,
      year,
      issueCount,
      pageCount,
      articleCount,
      verifiedPages: corpus.verifiedPages,
      needsReviewPages: corpus.needsReviewPages,
      sourceLine: corpus.meta.sourceLine,
    };
  });

  writeFileSync(
    path.join(OUT_ROOT, "manifest.json"),
    serialize({ generated_at: new Date().toISOString(), corpora }),
  );

  for (const corpus of synced) {
    const corpusDir = path.join(OUT_ROOT, corpus.slug);
    mkdirSync(corpusDir, { recursive: true });
    writeFileSync(path.join(corpusDir, "issues.json"), serialize(corpus.issues));
    for (const { issue, pages } of corpus.pages) {
      const issueDir = path.join(corpusDir, issue);
      mkdirSync(issueDir, { recursive: true });
      writeFileSync(path.join(issueDir, "pages.json"), serialize(pages));
    }
  }

  const sqlArticles = synced
    .flatMap((corpus) => corpus.sqlArticles)
    .sort((a, b) => a.id.localeCompare(b.id));
  const sqlIssues = synced.flatMap((corpus) =>
    corpus.issues.map((issue) => ({ corpus: corpus.slug, ...issue })),
  );
  writeFileSync(SQL_PATH, buildImportSql({ articles: sqlArticles, issues: sqlIssues }));

  for (const corpus of synced) {
    const pageCount = corpus.pages.reduce((total, issue) => total + issue.pages.length, 0);
    const blocks = corpus.pages.reduce(
      (total, issue) => total + issue.pages.reduce((sum, page) => sum + page.blocks.length, 0),
      0,
    );
    const markers = corpus.pages.reduce(
      (total, issue) =>
        total +
        issue.pages.reduce(
          (sum, page) => sum + page.blocks.filter((block) => block.type === "marker").length,
          0,
        ),
      0,
    );
    console.log(
      `  ${corpus.slug}：${corpus.issues.length} 期 / ${pageCount} 葉 / ${corpus.articles.length} 篇 / ${blocks} 塊（含 ${markers} 標記塊）`,
    );
  }
  console.log(`  已核驗葉 ${corpora.reduce((t, c) => t + c.verifiedPages, 0)}，待校葉 ${corpora.reduce((t, c) => t + c.needsReviewPages, 0)}`);

  if (warnings.length > 0) {
    console.warn(`\n容錯告警 ${warnings.length} 條：`);
    for (const warning of warnings.slice(0, 40)) console.warn(`  · ${warning}`);
    if (warnings.length > 40) console.warn(`  · 其餘 ${warnings.length - 40} 條從略`);
  }

  console.log(`\n已寫入 ${path.relative(REPO_ROOT, OUT_ROOT)} 與 ${path.relative(REPO_ROOT, SQL_PATH)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main();
}
