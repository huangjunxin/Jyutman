import assert from "node:assert/strict";
import test from "node:test";

import {
  LATIN_RATIO_THRESHOLD,
  isLatinDominant,
  latinRatio,
  markerNote,
  pageParam,
  percent,
  splitParagraphs,
  statusBadge,
} from "../src/utils/reader.ts";

test("splitParagraphs：按空行拆段，去段首尾空白", () => {
  assert.deepEqual(splitParagraphs("第一期\n\n照妖鏡"), ["第一期", "照妖鏡"]);
  assert.deepEqual(splitParagraphs("  廣州靖海門外迎祥街  "), ["廣州靖海門外迎祥街"]);
  assert.deepEqual(splitParagraphs("甲\n\n\n\n乙"), ["甲", "乙"]);
  assert.deepEqual(splitParagraphs(""), []);
});

test("latinRatio：只計非空白字符", () => {
  assert.equal(latinRatio("廣州靖海門外迎祥街"), 0);
  assert.equal(latinRatio("Of"), 1);
  assert.equal(latinRatio("It is not a tea-cup"), 14 / 15, "連字符算可見字符，唔算字母");
  assert.equal(latinRatio("   "), 0);
});

test("isLatinDominant：英文原文與傳教士拼式歸羅馬字層，中文夾雜唔歸", () => {
  assert.equal(isLatinDominant("THE SPOKEN LANGUAGES of China"), true);
  assert.equal(isLatinDominant("'m hai ch'a-pui; hai shui-pui"), true);
  assert.equal(isLatinDominant("唔係茶杯；係水杯"), false);
  assert.equal(
    isLatinDominant("（數字化告示頁：Internet Archive 掃描，cu31924023550951；無已知版權限制聲明）"),
    false,
  );
  assert.equal(LATIN_RATIO_THRESHOLD, 0.5);
});

test("markerNote：已登記標記有說明，未登記標記唔強作解釋", () => {
  assert.equal(markerNote("［插圖］"), "底本此處為插圖，影像待版權核查後開放。");
  assert.equal(markerNote("［空白頁］"), "掃描確認為空白葉。");
  assert.equal(markerNote("［現代襯頁］"), "現代掃描襯頁，非底本內容。");
  assert.equal(markerNote("［其他］"), null);
});

test("statusBadge：verified 為已核驗，其餘按未校呈現", () => {
  assert.deepEqual(statusBadge("verified"), { label: "已核驗", tone: "ok" });
  assert.deepEqual(statusBadge("needs_review"), { label: "OCR 未校", tone: "ocr" });
  assert.deepEqual(statusBadge("draft"), { label: "OCR 未校", tone: "ocr" });
  assert.deepEqual(statusBadge("未來新狀態"), { label: "OCR 未校", tone: "ocr" });
});

test("pageParam：葉碼三位補零", () => {
  assert.equal(pageParam(1), "001");
  assert.equal(pageParam(9), "009");
  assert.equal(pageParam(41), "041");
  assert.equal(pageParam(248), "248");
});

test("percent：一位小數，除數為零時回零", () => {
  assert.equal(percent(14, 221), 6.3);
  assert.equal(percent(170, 248), 68.5);
  assert.equal(percent(80, 220), 36.3);
  assert.equal(percent(1, 3), 33.3);
  assert.equal(percent(0, 0), 0);
});
