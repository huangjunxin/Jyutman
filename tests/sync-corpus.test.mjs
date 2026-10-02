import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildImportSql,
  buildPageRecord,
  chunkRows,
  parseJsonl,
  pickArticle,
  pickIssue,
  pickPage,
  pickYear,
  splitArticleText,
} from "../scripts/sync-corpus.mjs";

const fixture = readFileSync(new URL("./fixtures/sample-articles.jsonl", import.meta.url), "utf8");

function loadFixtureArticles() {
  return parseJsonl(fixture)
    .records.map(pickArticle)
    .filter((record) => record !== null);
}

function articlesOfPage(articles, page) {
  return articles.filter((article) => article.page === page);
}

test("parseJsonl：逐行解析，壞行計入 skipped，空行不算", () => {
  const { records, skipped } = parseJsonl('{"a":1}\n\nnot json\n{"b":2}\n');
  assert.deepEqual(records, [{ a: 1 }, { b: 2 }]);
  assert.equal(skipped, 1);
});

test("pickArticle：容錯未知字段、缺 title 記 null、缺 id 略去", () => {
  const { records } = parseJsonl(fixture);
  const articles = records.map(pickArticle);
  assert.equal(articles.at(-1), null, "缺 id 的記錄應被略去");

  const untitled = articles[0];
  assert.equal(untitled.title, null);
  assert.equal(untitled.status, "needs_review");

  const withExtras = articles[1];
  assert.equal(withExtras.title, "本報編輯總發行所在");
  assert.equal(withExtras.genre, undefined, "未知字段不進站點數據層");

  assert.equal(pickArticle({ id: "x", corpus: "c", issue: "i", page: "2", seq: 1, text: "" }), null);
  assert.equal(pickArticle({ id: "x", corpus: "c", issue: "i", page: 2, seq: 1, text: "文" }).status, "draft");
});

test("pickPage 與 pickIssue：無日期與考證說明容忍為 null，計數缺項記 0", () => {
  const page = pickPage({ corpus: "c", issue: "i", page: 3, text: "文", status: "verified" });
  assert.deepEqual(page, {
    corpus: "c",
    issue: "i",
    issue_date: null,
    page: 3,
    text: "文",
    articles: 0,
    status: "verified",
  });
  assert.equal(pickPage({ corpus: "c", page: 3 }), null);

  const issue = pickIssue({ corpus: "c", issue: "i", issue_date: null, date_note: "待考", pages: 4 });
  assert.equal(issue.issue_date, null);
  assert.equal(issue.date_note, "待考");
  assert.equal(issue.verified_pages, 0);
  assert.equal(issue.articles, 0);
});

test("splitArticleText：整段標記抽出，其餘段落保留原文（含 □ 與傳教士拼式）", () => {
  const { body, markers } = splitArticleText("第一期\n\n［插圖］\n\n照妖鏡");
  assert.equal(body, "第一期\n\n照妖鏡");
  assert.deepEqual(markers, ["［插圖］"]);

  const romanized = splitArticleText("唔係茶杯；係水杯\n\n'm hai ch'a-pui; hai shui-pui");
  assert.equal(romanized.body, "唔係茶杯；係水杯\n\n'm hai ch'a-pui; hai shui-pui");
  assert.deepEqual(romanized.markers, []);

  const blank = splitArticleText("［空白頁］");
  assert.equal(blank.body, "");
  assert.deepEqual(blank.markers, ["［空白頁］"]);
});

test("buildPageRecord：文章按 seq 排序，標記塊跟隨所屬文章塊", () => {
  const articles = articlesOfPage(loadFixtureArticles(), 2);
  const record = buildPageRecord(
    { page: 2, status: "needs_review" },
    [...articles].reverse(),
  );

  assert.equal(record.page, 2);
  assert.equal(record.status, "needs_review");
  assert.deepEqual(
    record.blocks.map((block) => block.type),
    ["article", "article", "article", "marker"],
  );
  assert.deepEqual(
    record.blocks.map((block) => block.id ?? null),
    ["gdvp-01-002-01", "gdvp-01-002-02", "gdvp-01-002-03", null],
  );
  assert.deepEqual(record.blocks.map((block) => block.seq ?? null), [1, 2, 3, null]);
  assert.equal(
    record.blocks[2].text,
    "",
    "整段標記的有題文章保留文章塊（標題唔可以跟標記一齊消失）",
  );
});

test("buildPageRecord：無題文章保留 title null，正文多段合成一塊", () => {
  const record = buildPageRecord(
    { page: 21, status: "verified" },
    articlesOfPage(loadFixtureArticles(), 21),
  );

  const [article, marker] = record.blocks;
  assert.equal(record.blocks.length, 2);
  assert.equal(article.type, "article");
  assert.equal(article.id, "rcc-021-01");
  assert.equal(article.text.split("\n\n").length, 4, "段內分段留給展示層切");
  assert.equal(
    article.text,
    "It is not a tea-cup; it is a tumhler\n\n唔係茶杯；係水杯\n\n'm hai ch'a-pui; hai shui-pui\n\n照妖鏡",
  );
  assert.equal(
    article.text_norm,
    "Itisnotatea-cup;itisatumhler唔係茶杯；係水杯'mhaich'a-pui;haishui-pui照妖鏡",
  );
  assert.deepEqual(marker, { type: "marker", text: "［插圖］" });
});

test("buildPageRecord：整段標記的無題文章不產生空文章塊", () => {
  const articles = loadFixtureArticles();
  const record = buildPageRecord({ page: 1, status: "verified" }, articlesOfPage(articles, 1));
  assert.deepEqual(
    record.blocks.map((block) => [block.type, block.title, block.text]),
    [
      ["article", null, "（書衣貼紙：LIBRARY ANNEX 2）"],
      ["marker", undefined, "［現代襯頁］"],
    ],
  );
});

test("buildPageRecord：status 由葉傳播，不取文章自身的 status", () => {
  const article = {
    id: "gdvp-01-002-04",
    title: "告白",
    seq: 4,
    text: "本報廣告",
    status: "verified",
  };
  const record = buildPageRecord({ page: 2, status: "needs_review" }, [article]);
  assert.equal(record.status, "needs_review");
  assert.equal(record.blocks[0].id, "gdvp-01-002-04");
});

test("pickYear：取最早年份，全空回退登記值", () => {
  assert.equal(pickYear(["1907-04-01", null, "1907-08-18"], null), 1907);
  assert.equal(pickYear(["1874"], null), 1874);
  assert.equal(pickYear([null, ""], 1912), 1912);
  assert.equal(pickYear([], null), null);
});

test("buildImportSql：啟用 trigram 主索引與 bigram / unigram 輔助表，單引號轉義", () => {
  const sql = buildImportSql({
    articles: [
      {
        id: "rcc-021-01",
        corpus: "readings-in-cantonese-colloquial",
        issue: "readings-in-cantonese-colloquial",
        issue_date: "1894",
        page: 21,
        seq: 1,
        title: "A tea-cup",
        text: "It's not a tea-cup",
        text_norm: "It'snotatea-cup",
        status: "verified",
      },
    ],
    issues: [
      {
        corpus: "readings-in-cantonese-colloquial",
        issue: "readings-in-cantonese-colloquial",
        issue_date: "1894",
        date_note: null,
        pages: 220,
        articles: 268,
        verified_pages: 80,
        needs_review_pages: 140,
      },
    ],
  });

  assert.match(sql, /CREATE TABLE IF NOT EXISTS articles/u);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS issues/u);
  assert.match(sql, /'It''s not a tea-cup'/u);
  assert.match(sql, /CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5\(\n  id UNINDEXED, title, text_norm, tokenize = 'trigram'/u);
  assert.match(sql, /INSERT INTO articles_fts \(id, title, text_norm\)\n  SELECT id, title, text_norm FROM articles;/u);
  assert.match(sql, /CREATE VIRTUAL TABLE IF NOT EXISTS articles_bigram_fts USING fts5/u);
  assert.match(sql, /CREATE VIRTUAL TABLE IF NOT EXISTS articles_unigram_fts USING fts5/u);
  assert.match(sql, /INSERT INTO articles_bigram_fts \(id, seg\) VALUES\n  \('rcc-021-01', 'It snotatea cup'\);/u);
  assert.match(sql, /INSERT INTO articles_unigram_fts \(id, seg\) VALUES\n  \('rcc-021-01', 'It snotatea cup'\);/u);
  assert.doesNotMatch(sql, /^-- CREATE VIRTUAL TABLE/mu, "註釋掉的備選 DDL 不再保留");
});

test("buildImportSql：漢字正文切出 bigram 與 unigram，短段略去空 seg 行", () => {
  const sql = buildImportSql({
    articles: [
      {
        id: "gdvp-01-001-01",
        corpus: "gd-vernacular-paper",
        issue: "issue-01",
        issue_date: "1907-04-01",
        page: 1,
        seq: 1,
        title: null,
        text: "白話報就係喇",
        text_norm: "白話報就係喇",
        status: "verified",
      },
      {
        id: "gdvp-01-001-02",
        corpus: "gd-vernacular-paper",
        issue: "issue-01",
        issue_date: "1907-04-01",
        page: 1,
        seq: 2,
        title: null,
        text: "唔",
        text_norm: "唔",
        status: "verified",
      },
    ],
    issues: [],
  });

  assert.match(sql, /'gdvp-01-001-01', '白話 話報 報就 就係 係喇'/u);
  assert.match(sql, /'gdvp-01-001-01', '白 話 報 就 係 喇'/u);
  assert.match(sql, /'唔', '唔'/u);
  assert.doesNotMatch(sql, /'gdvp-01-001-02', ''/u, "空 seg 不佔行");
});

test("chunkRows：按行長分批，超預算即開新批", () => {
  const rows = [["a".repeat(10)], ["b".repeat(10)], ["c".repeat(10)]];
  assert.deepEqual(chunkRows(rows, 14), [[rows[0]], [rows[1]], [rows[2]]]);
  assert.deepEqual(chunkRows(rows, 28), [[rows[0], rows[1]], [rows[2]]]);
  assert.deepEqual(chunkRows([], 30), []);
});
