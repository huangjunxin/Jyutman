import assert from "node:assert/strict";
import test from "node:test";

import {
  extractSnippet,
  ftsPhrase,
  MAX_QUERY_LENGTH,
  planSearch,
  RESULT_LIMIT,
  segmentNgrams,
  SNIPPET_RADIUS,
} from "../src/utils/search-planner.ts";

test("planSearch：按歸一後長度路由到三條索引路徑", () => {
  assert.equal(planSearch("").mode, "empty");
  assert.equal(planSearch("   ").mode, "empty");
  assert.equal(planSearch("唔").mode, "unigram");
  assert.equal(planSearch("廣東").mode, "bigram");
  assert.equal(planSearch("白話報").mode, "trigram");
  assert.equal(planSearch("廣東白話報").mode, "trigram");

  const simplified = planSearch("广东 白话");
  assert.equal(simplified.mode, "trigram");
  assert.equal(simplified.query, "廣東白話");
  assert.equal(simplified.length, 4);

  assert.equal(planSearch("om").mode, "bigram", "純拉丁兩字同樣走 bigram");
  assert.equal(planSearch("cap").mode, "trigram");
  assert.equal(planSearch("LESSON").mode, "trigram");
});

test("planSearch：常數與文檔一致", () => {
  assert.equal(RESULT_LIMIT, 20);
  assert.equal(SNIPPET_RADIUS, 60);
  assert.equal(MAX_QUERY_LENGTH, 100);
});

test("ftsPhrase：限定列名，雙引號按 FTS5 規則翻倍轉義", () => {
  assert.equal(ftsPhrase("text_norm", "白話報"), 'text_norm : "白話報"');
  assert.equal(ftsPhrase("seg", 'say "hi"'), 'seg : "say ""hi"""');
  assert.equal(
    ftsPhrase("seg", "OR NOT *"),
    'seg : "OR NOT *"',
    "整串在引號內，FTS5 元字符作字面量",
  );
});

test("segmentNgrams：漢字段滑動取二元組，重複 n-gram 保留", () => {
  assert.equal(segmentNgrams("白話報係中國人嘅聖藥", 2), "白話 話報 報係 係中 中國 國人 人嘅 嘅聖 聖藥");
  assert.equal(segmentNgrams("白話報係中國人嘅聖藥", 1), "白 話 報 係 中 國 人 嘅 聖 藥");
  assert.equal(segmentNgrams("哈哈哈", 2), "哈哈 哈哈", "去重會令「哈哈哈」同「哈哈」混淆");
  assert.equal(segmentNgrams("唔", 1), "唔");
  assert.equal(segmentNgrams("唔", 2), "", "單字漢字段無二元組");
});

test("segmentNgrams：標點截斷連續段，拉丁與數字整段保留", () => {
  assert.equal(segmentNgrams("廣。東", 2), "");
  assert.equal(segmentNgrams("廣。東", 1), "廣 東");
  assert.equal(segmentNgrams("tea-cup", 2), "tea cup");
  assert.equal(segmentNgrams("1874年", 1), "1874 年");
  assert.equal(segmentNgrams("ch'a-pui 唔係", 2), "ch a pui 唔係");
  assert.equal(segmentNgrams("", 1), "");
});

test("extractSnippet：命中點前後各取一段，兩端補省略號", () => {
  const text = `${"A".repeat(100)}廣東白話報${"B".repeat(100)}`;
  const snippet = extractSnippet(text, "白話報");
  assert.equal(snippet.length, 125);
  assert.ok(snippet.startsWith("…A"), "左側截斷補省略號");
  assert.ok(snippet.includes("廣東白話報"));
  assert.ok(snippet.endsWith("B…"), "右側截斷補省略號");
});

test("extractSnippet：空格歸一之後仍映回原文，命中在段首不補前置省略號", () => {
  assert.equal(extractSnippet("唔 係 茶 杯", "唔係茶杯"), "唔 係 茶 杯");
  assert.equal(extractSnippet("廣東白話報就係喇。", "白話報"), "廣東白話報就係喇。");
});

test("extractSnippet：拉丁查詢大小寫折疊，命中唔到時退回段首", () => {
  assert.equal(extractSnippet("LESSON ONE", "lesson"), "LESSON ONE");
  assert.equal(extractSnippet(`${"前".repeat(200)}`, "廣東"), `${"前".repeat(120)}…`);
});
