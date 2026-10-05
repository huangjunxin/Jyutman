import assert from "node:assert/strict";
import test from "node:test";

import { chineseNumeral, corpusMeta, formatWan, issueLabel, issueNumeral } from "../src/utils/corpus-meta.ts";

test("corpusMeta：已登記語料照原型字串，類型行按期數生成", () => {
  assert.deepEqual(corpusMeta({ slug: "gd-vernacular-paper", title: "廣東白話報", issueCount: 4 }), {
    tone: "kapok",
    shortTitle: "廣東白話報",
    spineTitle: "廣東白話報",
    script: "zh",
    era: "光緒三十三年 · 丁未",
    kind: "方言報紙 · 4 期",
  });
  const cvh = corpusMeta({
    slug: "canton-vernacular-handbook",
    title: "A Handbook of the Canton Vernacular of the Chinese Language",
    issueCount: 1,
  });
  assert.equal(cvh.tone, "ink");
  assert.equal(cvh.shortTitle, "Canton Vernacular Handbook");
  assert.equal(cvh.spineTitle, "Canton Vernacular");
  assert.equal(cvh.script, "en");
  assert.equal(cvh.era, null);
  assert.equal(cvh.kind, "單冊 · 粵英對照");
  const rcc = corpusMeta({ slug: "readings-in-cantonese-colloquial", title: "Readings in Cantonese Colloquial", issueCount: 1 });
  assert.equal(rcc.tone, "green");
  assert.equal(rcc.shortTitle, "Readings in Cantonese Colloquial");
  assert.equal(rcc.spineTitle, "Cantonese Colloquial");
});

test("corpusMeta：未登記語料用後備，色調按 index 輪替", () => {
  const zh = corpusMeta({ slug: "new-paper", title: "嶺南白話雜誌", issueCount: 3 }, 4);
  assert.deepEqual(zh, {
    tone: "ink",
    shortTitle: "嶺南白話雜誌",
    spineTitle: "嶺南白話雜誌",
    script: "zh",
    era: null,
    kind: "3 期",
  });
  const en = corpusMeta({ slug: "new-book", title: "Cantonese Made Easy", issueCount: 1 });
  assert.equal(en.tone, "kapok");
  assert.equal(en.script, "en");
  assert.equal(en.kind, "單冊");
  assert.equal(corpusMeta({ slug: "x", title: "x", issueCount: 1 }, 5).tone, "green");
});

test("chineseNumeral：1 至 99 轉中文數字，範圍外照出阿拉伯數字", () => {
  assert.equal(chineseNumeral(1), "一");
  assert.equal(chineseNumeral(7), "七");
  assert.equal(chineseNumeral(10), "十");
  assert.equal(chineseNumeral(11), "十一");
  assert.equal(chineseNumeral(20), "二十");
  assert.equal(chineseNumeral(35), "三十五");
  assert.equal(chineseNumeral(99), "九十九");
  assert.equal(chineseNumeral(0), "0");
  assert.equal(chineseNumeral(100), "100");
  assert.equal(chineseNumeral(1.5), "1.5");
});

test("issueLabel：多期出「第N期」，單冊語料出「單冊」", () => {
  assert.equal(issueLabel(4, "issue-01"), "第一期");
  assert.equal(issueLabel(4, "issue-02"), "第二期");
  assert.equal(issueLabel(4, "issue-05"), "第五期");
  assert.equal(issueLabel(4, "issue-07"), "第七期");
  assert.equal(issueLabel(30, "issue-12"), "第十二期");
  assert.equal(issueLabel(1, "canton-vernacular-handbook"), "單冊");
  assert.equal(issueLabel(2, "supplement"), "supplement", "冇數字照出 slug");
});

test("issueNumeral：期號短標", () => {
  assert.equal(issueNumeral("issue-01"), "一");
  assert.equal(issueNumeral("issue-05"), "五");
  assert.equal(issueNumeral("issue-07"), "七");
  assert.equal(issueNumeral("supplement"), "supplement");
});

test("formatWan：萬字無條件捨去到一位小數", () => {
  assert.equal(formatWan(666143), "66.6");
  assert.equal(formatWan(666999), "66.6");
  assert.equal(formatWan(10000), "1");
  assert.equal(formatWan(9999), "0.9");
  assert.equal(formatWan(0), "0");
});
