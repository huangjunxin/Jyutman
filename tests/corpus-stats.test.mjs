import assert from "node:assert/strict";
import test from "node:test";

import {
  charCount,
  countCharacters,
  countTranslated,
  firstReadablePage,
  issueToc,
  READABLE_MIN_CHARS,
} from "../src/utils/corpus-stats.ts";

const article = (id, text, title = null) => ({ type: "article", id, title, seq: 1, text, text_norm: text });
const marker = (text) => ({ type: "marker", text });

test("charCount：去晒空白（含全角空格），擴展區字按碼點計一個", () => {
  assert.equal(charCount("廣東 白話\n\n報"), 5);
  assert.equal(charCount("　□ 𠝹"), 2, "□ 原樣算一個字，𠝹（U+20779）唔會拆成兩個");
  assert.equal(charCount("Of the  tones"), 10);
  assert.equal(charCount(""), 0);
});

test("countCharacters：只計文章塊，版面標記唔計", () => {
  const pages = [
    { page: 1, status: "verified", blocks: [marker("［插圖］"), article("a", "廣東 白話報")] },
    { page: 2, status: "draft", blocks: [article("b", "唔係\n\n咁")] },
  ];
  assert.equal(countCharacters(pages), 8);
  assert.equal(countCharacters([]), 0);
});

test("countTranslated：各期今譯表鍵數相加", () => {
  const entry = { paragraphs: ["譯"], note_count: 0 };
  assert.equal(countTranslated([{ a: entry, b: entry }, {}, { c: entry }]), 3);
  assert.equal(countTranslated([]), 0);
});

test("firstReadablePage：跳過封面，搵首個有 40 字以上文章塊嘅頁", () => {
  assert.equal(READABLE_MIN_CHARS, 40);
  const long = "字".repeat(40);
  const pages = [
    { page: 1, status: "draft", blocks: [marker("［現代襯頁］")] },
    { page: 2, status: "draft", blocks: [article("a", "第一期")] },
    { page: 3, status: "draft", blocks: [article("b", "字 ".repeat(39))] },
    { page: 4, status: "draft", blocks: [article("c", long)] },
    { page: 5, status: "draft", blocks: [article("d", long)] },
  ];
  assert.equal(firstReadablePage(pages), 4, "空白唔計入字數，39 字嗰頁唔夠");
  assert.equal(firstReadablePage(pages, 3), 2);
});

test("firstReadablePage：冇頁夠字就返回第一頁，冇頁返回 undefined", () => {
  const pages = [
    { page: 7, status: "draft", blocks: [article("a", "短")] },
    { page: 8, status: "draft", blocks: [marker("［插圖］")] },
  ];
  assert.equal(firstReadablePage(pages), 7);
  assert.equal(firstReadablePage([]), undefined);
});

test("issueToc：按頁序列出有篇名嘅文章，null 同空白篇名略去", () => {
  const pages = [
    { page: 1, status: "draft", blocks: [article("p1-1", "正文", "白話報係中國人嘅聖藥"), marker("［插圖］")] },
    { page: 2, status: "draft", blocks: [article("p2-1", "續", null), article("p2-2", "正文", "  ")] },
    { page: 3, status: "draft", blocks: [article("p3-1", "正文", "解明官場現形圖")] },
  ];
  assert.deepEqual(issueToc(pages), [
    { page: 1, id: "p1-1", title: "白話報係中國人嘅聖藥" },
    { page: 3, id: "p3-1", title: "解明官場現形圖" },
  ]);
  assert.deepEqual(issueToc([]), []);
});
