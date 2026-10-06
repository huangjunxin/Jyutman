import assert from "node:assert/strict";
import test from "node:test";

import { buildCitations, citationTitle } from "../src/utils/citation.ts";

const base = {
  articleId: "gdvp-01-009-01",
  title: "白話報係中國人嘅聖藥",
  corpusTitle: "廣東白話報",
  issueDate: "1907-04-01",
  page: 9,
  url: "https://jyutman.com/read/gd-vernacular-paper/issue-01/009/#gdvp-01-009-01",
};

test("buildCitations：純文字一行含篇名、底本、年代、頁碼、永久 URL", () => {
  const { text } = buildCitations(base);
  assert.equal(
    text,
    "〈白話報係中國人嘅聖藥〉。《廣東白話報》，1907-04-01，第 009 頁。粵語文叢（Jyutman）。https://jyutman.com/read/gd-vernacular-paper/issue-01/009/#gdvp-01-009-01",
  );
});

test("buildCitations：無題用「語料 + 頁碼」且純文字唔加篇名括號", () => {
  const { text, bibtex } = buildCitations({ ...base, title: null });
  assert.equal(citationTitle({ ...base, title: null }), "廣東白話報 第 009 頁");
  assert.ok(!text.includes("〈"));
  assert.ok(text.startsWith("《廣東白話報》，1907-04-01，第 009 頁。"));
  assert.ok(bibtex.includes("title        = {廣東白話報 第 009 頁}"));
});

test("buildCitations：BibTeX 取年份、帶授權註與 URL，無作者字段", () => {
  const { bibtex } = buildCitations(base);
  assert.ok(bibtex.startsWith("@misc{jyutman-gdvp-01-009-01,"));
  assert.ok(bibtex.includes("  year         = {1907},"));
  assert.ok(bibtex.includes("  date         = {1907-04-01},"));
  assert.ok(bibtex.includes("底本屬公有領域，文本授權 CC BY-SA 4.0"));
  assert.ok(bibtex.includes(`  url          = {${base.url}}`));
  assert.ok(!bibtex.includes("author"), "冇作者字段就唔編造");
  assert.ok(bibtex.trimEnd().endsWith("}"));
});

test("buildCitations：RIS 為 TY/TI/T2/PY/DA/SP/PB/UR/ER 行；無日期時省略年份", () => {
  const { ris } = buildCitations(base);
  const lines = ris.split("\n");
  assert.equal(lines[0], "TY  - GEN");
  assert.ok(lines.includes("TI  - 白話報係中國人嘅聖藥"));
  assert.ok(lines.includes("T2  - 廣東白話報"));
  assert.ok(lines.includes("PY  - 1907"));
  assert.ok(lines.includes("DA  - 1907-04-01"));
  assert.ok(lines.includes("SP  - 第 009 頁"));
  assert.ok(lines.includes(`UR  - ${base.url}`));
  assert.equal(lines.at(-1), "ER  - ");

  const undated = buildCitations({ ...base, issueDate: null });
  assert.ok(!undated.ris.includes("PY  -"));
  assert.ok(undated.ris.includes("DA  - 年代待考"));
  assert.ok(!undated.bibtex.includes("year"));
  assert.ok(undated.text.includes("年代待考"));
});
