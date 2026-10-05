import assert from "node:assert/strict";
import test from "node:test";

import { mergeParagraphSpans, splitParagraphSpans } from "../src/utils/reader.ts";
import {
  clipText,
  CORRECTION_TYPES,
  fragmentAround,
  highlightRanges,
  renderParagraphSegments,
  renderTranslation,
  selectionSpan,
} from "../src/utils/reader-view.ts";

test("CORRECTION_TYPES：五類，同閱讀頁 chips 一致", () => {
  assert.deepEqual([...CORRECTION_TYPES], ["錯字", "缺字", "標點分段", "今譯疑問", "其他"]);
});

test("renderParagraphSegments：每片帶正文下標，注音按原下標對表", () => {
  const [group] = mergeParagraphSpans(splitParagraphSpans("（亞拙）\n\n哈哈。"));
  const html = renderParagraphSegments(group, new Map([[6, "haa1"]]));
  assert.equal(html, '<span data-o="0">（亞拙）</span><span data-o="6"><ruby>哈<rt>haa1</rt></ruby>哈。</span>');
});

test("renderParagraphSegments：拉丁邊界補空格喺片外，□ 保留缺字樣式，轉義 <", () => {
  const [group] = mergeParagraphSpans(splitParagraphSpans("Rice\n\nis <good>"));
  assert.equal(group.spans.length, 2);
  assert.equal(
    renderParagraphSegments(group, new Map()),
    '<span data-o="0">Rice</span> <span data-o="6">is &lt;good&gt;</span>',
  );
  const [missing] = mergeParagraphSpans(splitParagraphSpans("有□"));
  assert.match(renderParagraphSegments(missing, new Map()), /<span class="miss" title="未辨識字">□<\/span>/u);
});

test("renderTranslation：〔…〕譯者註包 span，其餘轉義照出", () => {
  assert.equal(
    renderTranslation("係木枳嚟嘅〔譯者疑：「木枳」疑指木塞〕。"),
    '係木枳嚟嘅<span class="tr-note">〔譯者疑：「木枳」疑指木塞〕</span>。',
  );
  assert.equal(renderTranslation("a < b"), "a &lt; b");
  assert.equal(renderTranslation("未收尾〔譯者疑"), "未收尾〔譯者疑", "冇收尾括號唔當譯註");
  assert.equal(renderTranslation(""), "");
});

test("highlightRanges：簡轉繁、去空白之後定位，映返原文區間", () => {
  assert.deepEqual(highlightRanges("白話報係中國人嘅聖藥。白話報", "白话报"), [
    [0, 3],
    [11, 14],
  ]);
  assert.deepEqual(highlightRanges("白話\n\n報", "白話報"), [[0, 5]], "跨空白命中，區間包住空白");
  assert.deepEqual(highlightRanges("Rice is RICE", "rice"), [
    [0, 4],
    [8, 12],
  ]);
  assert.deepEqual(highlightRanges("哈哈哈", "哈哈"), [[0, 2]], "命中唔重疊");
  assert.deepEqual(highlightRanges("嘢", "野"), [], "唔同字唔摺疊");
  assert.deepEqual(highlightRanges("任何", "  "), []);
  assert.deepEqual(highlightRanges("𠝹開", "開"), [[2, 3]], "擴展區字佔兩個 UTF-16 單位");
});

test("selectionSpan：取各片非空白字嘅碼點區間", () => {
  assert.deepEqual(selectionSpan([{ start: 6, text: "哈哈" }]), { start: 6, end: 8 });
  assert.deepEqual(
    selectionSpan([
      { start: 2, text: " is" },
      { start: 10, text: "big " },
    ]),
    { start: 3, end: 13 },
  );
  assert.deepEqual(selectionSpan([{ start: 0, text: "𠝹開" }]), { start: 0, end: 2 }, "按碼點計");
  assert.equal(selectionSpan([{ start: 4, text: "  " }]), null);
  assert.equal(selectionSpan([]), null);
});

test("fragmentAround：前後各取 radius 個碼點", () => {
  assert.equal(fragmentAround("乜野叫做聖藥呢。白話報就係喇。", "聖藥", 2), "叫做聖藥呢。");
  assert.equal(fragmentAround("聖藥", "聖藥"), "聖藥");
  assert.equal(fragmentAround("abc", "zz"), "zz", "搵唔到就只回所選文字");
  assert.equal(fragmentAround("𠝹𠝹聖𠝹", "聖", 1), "𠝹聖𠝹", "唔會切開代理對");
});

test("clipText：按 UTF-16 長度截，唔切代理對", () => {
  assert.equal(clipText("聖藥呢", 2), "聖藥");
  assert.equal(clipText("a𠝹", 2), "a", "擴展區字放唔落就停");
  assert.equal(clipText("短", 40), "短");
});
