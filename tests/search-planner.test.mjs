import assert from "node:assert/strict";
import test from "node:test";

import {
  ftsPhrase,
  locateAndSlice,
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

test("locateAndSlice：命中點前後各取一段，highlight 為原文命中處，兩端補省略號", () => {
  const text = `${"A".repeat(100)}廣東白話報${"B".repeat(100)}`;
  const parts = locateAndSlice(text, "白話報");
  assert.equal(parts.pre.length, 61);
  assert.ok(parts.pre.startsWith("…A"), "左側截斷補省略號");
  assert.ok(parts.pre.endsWith("廣東"), "命中前文照原文保留");
  assert.equal(parts.highlight, "白話報");
  assert.equal(parts.post.length, 61);
  assert.ok(parts.post.startsWith("B"));
  assert.ok(parts.post.endsWith("B…"), "右側截斷補省略號");
});

test("locateAndSlice：簡體查詢經映射高亮底本繁體原字", () => {
  assert.equal(locateAndSlice("廣東白話報就係喇。", planSearch("广东").query).highlight, "廣東");
  assert.equal(locateAndSlice("廣東白話報就係喇。", planSearch("白话报").query).highlight, "白話報");
  assert.deepEqual(locateAndSlice("廣東白話報就係喇。", "廣東"), {
    pre: "",
    highlight: "廣東",
    post: "白話報就係喇。",
  });
});

test("locateAndSlice：stripSpaces 之後仍映回原文，命中在段首不補前置省略號", () => {
  assert.deepEqual(locateAndSlice("唔 係 茶 杯", "唔係茶杯"), {
    pre: "",
    highlight: "唔 係 茶 杯",
    post: "",
  });
  assert.deepEqual(locateAndSlice("佢話 唔 係 你", "唔係"), {
    pre: "佢話",
    highlight: "唔 係",
    post: "你",
  });
});

test("locateAndSlice：多處命中只取首處，拉丁查詢大小寫折疊", () => {
  assert.deepEqual(locateAndSlice("甲乙廣東丙丁廣東戊", "廣東"), {
    pre: "甲乙",
    highlight: "廣東",
    post: "丙丁廣東戊",
  });
  assert.equal(locateAndSlice("LESSON ONE", "lesson").highlight, "LESSON");
});

test("locateAndSlice：找不到命中時退化為段首，highlight 為 null", () => {
  assert.deepEqual(locateAndSlice("一二三", "廣東"), { pre: "一二三", highlight: null, post: null });
  assert.deepEqual(locateAndSlice(`${"前".repeat(200)}`, "廣東"), {
    pre: `${"前".repeat(60)}…`,
    highlight: null,
    post: null,
  });
  assert.deepEqual(locateAndSlice("", "廣東"), { pre: "", highlight: null, post: null });
});
