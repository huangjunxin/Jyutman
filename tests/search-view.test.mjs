import assert from "node:assert/strict";
import test from "node:test";

import {
  facetPills,
  hitHref,
  hitIssueLabel,
  normalizationNotice,
  searchHref,
  searchModeLabel,
} from "../src/utils/search-view.ts";

test("searchModeLabel：有漢字係漢字檢索，純拉丁係英文全文檢索", () => {
  assert.equal(searchModeLabel("廣東"), "漢字檢索");
  assert.equal(searchModeLabel("tone 聲"), "漢字檢索");
  assert.equal(searchModeLabel("tone"), "英文全文檢索");
});

test("normalizationNotice：只喺歸一後唔同先提示；去空白唔算", () => {
  assert.equal(
    normalizationNotice("广东", "廣東"),
    "已將「广东」歸一為「廣東」檢索；下面照樣顯示底本原字。",
  );
  assert.equal(normalizationNotice("廣東", "廣東"), null);
  assert.equal(normalizationNotice("廣 東", "廣東"), null);
  assert.equal(normalizationNotice("tone class", "toneclass"), null);
  assert.equal(normalizationNotice("x", ""), null);
});

test("hitHref：三位補零頁碼、?hl= 編碼、文章錨點", () => {
  assert.equal(
    hitHref({ corpus: "gd-vernacular-paper", issue: "issue-01", page: 3, id: "gdvp-01-003-01" }, "广东"),
    "/read/gd-vernacular-paper/issue-01/003/?hl=%E5%B9%BF%E4%B8%9C#gdvp-01-003-01",
  );
  assert.equal(hitHref({ corpus: "c", issue: "i", page: 120 }, "a b"), "/read/c/i/120/?hl=a%20b");
});

test("searchHref：冇查詢字回 /search/，有 corpus 就加", () => {
  assert.equal(searchHref(""), "/search/");
  assert.equal(searchHref("唔係"), "/search/?q=%E5%94%94%E4%BF%82");
  assert.equal(searchHref("tone", "canton-vernacular-handbook"), "/search/?q=tone&corpus=canton-vernacular-handbook");
});

test("facetPills：全部加埋、跳過冇命中嘅語料、保留已選中嘅", () => {
  const corpora = [
    { slug: "gd", shortTitle: "廣東白話報" },
    { slug: "cvh", shortTitle: "Canton Vernacular Handbook" },
    { slug: "rcc", shortTitle: "Readings in Cantonese Colloquial" },
  ];
  const facets = { gd: 71, cvh: 1 };
  assert.deepEqual(facetPills(corpora, facets, null), [
    { slug: null, label: "全部", count: 72 },
    { slug: "gd", label: "廣東白話報", count: 71 },
    { slug: "cvh", label: "Canton Vernacular Handbook", count: 1 },
  ]);
  assert.deepEqual(facetPills(corpora, facets, "rcc").at(-1), {
    slug: "rcc",
    label: "Readings in Cantonese Colloquial",
    count: 0,
  });
  assert.deepEqual(facetPills(corpora, {}, null), [{ slug: null, label: "全部", count: 0 }]);
});

test("hitIssueLabel：單冊出年份，多期出第N期，未知語料照 slug 推", () => {
  assert.equal(hitIssueLabel({ issueCount: 1, year: 1874 }, "canton-vernacular-handbook"), "1874");
  assert.equal(hitIssueLabel({ issueCount: 1, year: null }, "x"), "單冊");
  assert.equal(hitIssueLabel({ issueCount: 4, year: 1907 }, "issue-05"), "第五期");
  assert.equal(hitIssueLabel(undefined, "issue-02"), "第二期");
});
