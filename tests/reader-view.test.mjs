import assert from "node:assert/strict";
import test from "node:test";

import { mergeParagraphSpans, splitParagraphSpans } from "../src/utils/reader.ts";
import {
  clipText,
  CORRECTION_TYPES,
  findReportRanges,
  fragmentAround,
  highlightRanges,
  isPointInDictKeepZone,
  MOBILE_LAYOUT_QUERY,
  renderParagraphSegments,
  renderTranslation,
  resolveReaderLayout,
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

test("fragmentAround：前文取尾、後文取頭各 radius 個碼點", () => {
  assert.equal(fragmentAround("乜野叫做", "聖藥", "呢。白話報", 2), "叫做聖藥呢。");
  assert.equal(fragmentAround("", "聖藥", ""), "聖藥");
  assert.equal(fragmentAround("係官嚟播。係滿清嘅", "官嚟播", "。點解", 3), "滿清嘅官嚟播。點解", "按選區位置切，唔會跳去前面同樣嘅字");
  assert.equal(fragmentAround("𠝹𠝹", "聖", "𠝹𠝹", 1), "𠝹聖𠝹", "唔會切開代理對");
});

test("clipText：按 UTF-16 長度截，唔切代理對", () => {
  assert.equal(clipText("聖藥呢", 2), "聖藥");
  assert.equal(clipText("a𠝹", 2), "a", "擴展區字放唔落就停");
  assert.equal(clipText("短", 40), "短");
});

test("resolveReaderLayout：未設定偏好時手機橫排、桌面豎排；顯式偏好覆蓋端側預設", () => {
  assert.equal(MOBILE_LAYOUT_QUERY, "(max-width: 767px)");
  // 未設定 / null / 非法值
  assert.equal(resolveReaderLayout(undefined, true), "horizontal");
  assert.equal(resolveReaderLayout(undefined, false), "vertical");
  assert.equal(resolveReaderLayout(null, true), "horizontal");
  assert.equal(resolveReaderLayout(null, false), "vertical");
  assert.equal(resolveReaderLayout("", true), "horizontal");
  assert.equal(resolveReaderLayout("auto", false), "vertical");
  assert.equal(resolveReaderLayout(123, true), "horizontal");
  // 顯式偏好覆蓋端側預設
  assert.equal(resolveReaderLayout("vertical", true), "vertical", "手機端顯式揀豎排");
  assert.equal(resolveReaderLayout("horizontal", false), "horizontal", "桌面端顯式揀橫排");
  assert.equal(resolveReaderLayout("horizontal", true), "horizontal");
  assert.equal(resolveReaderLayout("vertical", false), "vertical");
});

test("isPointInDictKeepZone：未彈卡只容許 10px 內；開卡後容許從字移入浮卡", () => {
  const anchor = { x: 500, y: 400 };
  // 未打開（cardRect === null）：10px 曼哈頓距離
  assert.equal(isPointInDictKeepZone({ x: 505, y: 405 }, anchor, null), true);
  assert.equal(isPointInDictKeepZone({ x: 506, y: 405 }, anchor, null), false);

  // 已打開（浮卡喺字上方）：由字移動進入浮卡連結位置要保留，移出浮卡同點擊點遠處先關閉
  const cardAbove = { left: 400, top: 260, right: 600, bottom: 376 };
  assert.equal(isPointInDictKeepZone({ x: 500, y: 380 }, anchor, cardAbove), true, "跨越字同卡之間空隙");
  assert.equal(isPointInDictKeepZone({ x: 500, y: 310 }, anchor, cardAbove), true, "喺浮卡連結上");
  assert.equal(isPointInDictKeepZone({ x: 500, y: 420 }, anchor, cardAbove), false, "向下離開點擊點");
  assert.equal(isPointInDictKeepZone({ x: 370, y: 310 }, anchor, cardAbove), false, "向左離開浮卡");
  assert.equal(isPointInDictKeepZone({ x: 500, y: 240 }, anchor, cardAbove), false, "向上離開浮卡");

  // 浮卡喺字下方（靠近螢幕頂時）
  const cardBelow = { left: 400, top: 420, right: 600, bottom: 530 };
  assert.equal(isPointInDictKeepZone({ x: 500, y: 470 }, anchor, cardBelow), true, "向下移入浮卡");
  assert.equal(isPointInDictKeepZone({ x: 500, y: 380 }, anchor, cardBelow), false, "向上離開點擊點");
});

test("findReportRanges：靠上下文 fragment 精準落位，唔誤標其他區同字", () => {
  const title = "白話報係中國人嘅聖藥";
  const body = "乜野叫做聖藥呢。白話報就係喇。";
  // 篇名上報：只命中篇名，唔會誤標正文入面同字「聖藥」
  assert.deepEqual(findReportRanges(title, "聖藥", title), [[8, 10]]);
  assert.deepEqual(findReportRanges(body, "聖藥", title), []);

  // 正文重複詞靠 fragment 區分第二處
  const repeated = "係官嚟播。係滿清嘅官嚟播。";
  assert.deepEqual(findReportRanges(repeated, "官嚟播", "滿清嘅官嚟播。"), [[9, 12]]);

  // 簡繁／空白容錯；僅當 fragment 為空先退回第一處
  assert.deepEqual(findReportRanges(body, "聖藥", ""), [[4, 6]]);
  assert.deepEqual(findReportRanges(body, "", title), []);
});
