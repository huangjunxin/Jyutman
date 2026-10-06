import assert from "node:assert/strict";
import test from "node:test";

import {
  endsWithSentenceEnd,
  isCjkDominant,
  LATIN_RATIO_THRESHOLD,
  isLatinDominant,
  latinRatio,
  markerNote,
  mergeParagraphSpans,
  MODTRANS_JOIN,
  pageParam,
  pairTranslations,
  paragraphJoin,
  percent,
  readingsByIndex,
  renderAnnotatedParagraph,
  splitParagraphs,
  splitParagraphSpans,
  statusBadge,
  wordAround,
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

test("isCjkDominant：漢字多過拉丁字母先豎排；純英文目錄、頁碼、半中半英唔豎", () => {
  assert.equal(isCjkDominant("唔係茶杯；係水杯"), true);
  assert.equal(isCjkDominant("𠝹開"), true, "擴展區字照計");
  assert.equal(isCjkDominant("PREFACE ... ... ... ... ... ... page iii\n\nINTRODUCTION ... ... ... iv"), false, "點線拉低字母佔比都唔豎");
  assert.equal(isCjkDominant("(22)"), false, "冇漢字唔豎");
  assert.equal(isCjkDominant(""), false);
  assert.equal(
    isCjkDominant("（數字化告示頁：Internet Archive 掃描，cu31924023550951；無已知版權限制聲明）"),
    false,
    "漢字同字母一樣多唔豎",
  );
});

test("markerNote：已登記標記有說明，未登記標記唔強作解釋", () => {
  assert.equal(markerNote("［插圖］"), "底本此處為插圖，影像待版權核查後開放。");
  assert.equal(markerNote("［空白頁］"), "掃描確認為空白頁。");
  assert.equal(markerNote("［現代襯頁］"), "現代掃描襯頁，非底本內容。");
  assert.equal(markerNote("［其他］"), null);
});

test("statusBadge：verified 為已核驗，其餘按未校呈現", () => {
  assert.deepEqual(statusBadge("verified"), { label: "已核驗", tone: "ok" });
  assert.deepEqual(statusBadge("needs_review"), { label: "OCR 未校", tone: "ocr" });
  assert.deepEqual(statusBadge("draft"), { label: "OCR 未校", tone: "ocr" });
  assert.deepEqual(statusBadge("未來新狀態"), { label: "OCR 未校", tone: "ocr" });
});

test("pageParam：頁碼三位補零", () => {
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

test("splitParagraphSpans：段落起始下標按碼點計，供粵拼對表", () => {
  assert.deepEqual(splitParagraphSpans("第一期\n\n照妖鏡"), [
    { text: "第一期", start: 0 },
    { text: "照妖鏡", start: 5 },
  ]);
  assert.deepEqual(splitParagraphSpans("  甲  \n\n\n\n乙"), [
    { text: "甲", start: 2 },
    { text: "乙", start: 9 },
  ]);
  assert.deepEqual(splitParagraphSpans(""), []);
});

test("renderAnnotatedParagraph：漢字包 ruby，標點與拉丁唔注", () => {
  const readings = new Map([
    [0, "gwong2"],
    [1, "dung1"],
  ]);
  assert.equal(
    renderAnnotatedParagraph("廣東，ABC！", 0, readings),
    "<ruby>廣<rt>gwong2</rt></ruby><ruby>東<rt>dung1</rt></ruby>，ABC！",
  );
});

test("renderAnnotatedParagraph：段落起始下標對正文章節偏移，HTML 特殊字元轉義", () => {
  assert.equal(
    renderAnnotatedParagraph("照妖鏡", 5, new Map([[5, "ziu3"]])),
    "<ruby>照<rt>ziu3</rt></ruby>妖鏡",
    "段落內第一個字對正文下標 5",
  );
  assert.equal(renderAnnotatedParagraph("a<b>&", 0, new Map()), "a&lt;b&gt;&amp;");
});

test("renderAnnotatedParagraph：冇音表文章兜底唔注，□ 保留缺字樣式", () => {
  assert.equal(
    renderAnnotatedParagraph("甲□乙", 0, new Map()),
    '甲<span class="miss" title="未辨識字">□</span>乙',
  );
  assert.equal(
    renderAnnotatedParagraph("甲□乙", 3, new Map()),
    '甲<span class="miss" title="未辨識字">□</span>乙',
    "冇音表時行為與有表但該處無讀音一致",
  );
});

test("readingsByIndex：條目轉查表，缺音表返回空表", () => {
  assert.deepEqual([...readingsByIndex([[0, "甲", "gaap3"]]).entries()], [[0, "gaap3"]]);
  assert.equal(readingsByIndex(undefined).size, 0);
  assert.equal(readingsByIndex([]).size, 0);
});

test("endsWithSentenceEnd：漢文與英文句末標點，段末收尾引號／括號先跳過", () => {
  for (const text of ["完喇。", "點解？", "好！", "甲；", "待續…", "佢話「得喇。」", "佢話『好』"]) {
    assert.equal(endsWithSentenceEnd(text), true, text);
  }
  for (const text of ["未完呢", "甲乙，", "甲乙、", "（亞拙）", "未完播）", ""]) {
    assert.equal(endsWithSentenceEnd(text), false, text);
  }
  assert.equal(endsWithSentenceEnd('he "great meal."'), true, "英文句號加收尾引號");
  assert.equal(endsWithSentenceEnd("It is a tea-cup; it is a tumhler"), false, "英文斷句處未收");
  assert.equal(endsWithSentenceEnd("Lesson one."), true);
  assert.equal(endsWithSentenceEnd("  甲乙。  "), true, "段首尾空白唔影響判定");
});

test("paragraphJoin：拉丁詞邊界補一個空格，漢字之間直接連排", () => {
  assert.equal(paragraphJoin("甲乙", "丙丁"), "");
  assert.equal(paragraphJoin("甲乙，", "丙丁"), "");
  assert.equal(paragraphJoin("甲乙", "（都未完播）"), "");
  assert.equal(paragraphJoin("it is a tumhler", "唔係茶杯"), " ");
  assert.equal(paragraphJoin("唔係茶杯", "'m hai ch'a-pui"), " ");
  assert.equal(paragraphJoin("nga ts'z", "hau"), " ");
});

test("mergeParagraphSpans：前段末冇句末標點即連排，遇句末標點或塊末才分段", () => {
  assert.deepEqual(
    mergeParagraphSpans(splitParagraphSpans("第一期\n\n省城\n\n香港。\n\n澳門")).map((group) => group.text),
    ["第一期省城香港。", "澳門"],
  );
  const merged = mergeParagraphSpans(splitParagraphSpans("擋住架車\n\n（都未完播）"));
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].spans.map((span) => span.start), [0, 6], "各片仍帶正文章節下標");
  assert.equal(merged[0].text, "擋住架車（都未完播）");
});

test("mergeParagraphSpans：英文段補空格連排，句號收尾唔連", () => {
  assert.deepEqual(
    mergeParagraphSpans(splitParagraphSpans("It is not a tea-cup\n\nit is a tumhler")).map((g) => g.text),
    ["It is not a tea-cup it is a tumhler"],
  );
  assert.deepEqual(
    mergeParagraphSpans(splitParagraphSpans("Lesson one.\n\nLesson two.")).map((g) => g.text),
    ["Lesson one.", "Lesson two."],
  );
});

test("mergeParagraphSpans：合併只喺文章塊內發生，塊與塊之間唔連（標記塊唔參與）", () => {
  const first = mergeParagraphSpans(splitParagraphSpans("甲乙"));
  const second = mergeParagraphSpans(splitParagraphSpans("丙丁"));
  assert.deepEqual([...first, ...second].map((group) => group.text), ["甲乙", "丙丁"]);
  assert.deepEqual(mergeParagraphSpans([]), []);
});

test("pairTranslations：原文組合併之後，譯文按同組順序連排", () => {
  const groups = mergeParagraphSpans(splitParagraphSpans("第一期\n\n省城\n\n香港。\n\n澳門"));
  const paired = pairTranslations(groups, ["第一期", "省城", "香港。", "澳門"]);
  assert.equal(paired?.length, 2);
  assert.equal(paired?.[0].translation, `第一期${MODTRANS_JOIN}省城${MODTRANS_JOIN}香港。`, "三段落併成一段，譯文同步連排");
  assert.equal(paired?.[1].translation, "澳門");
  assert.equal(paired?.[0].paragraph.text, "第一期省城香港。");
});

test("pairTranslations：段數唔等返回 null（呼叫方跳過該篇），無譯文時原文照排", () => {
  const groups = mergeParagraphSpans(splitParagraphSpans("甲乙\n\n丙丁"));
  assert.equal(pairTranslations(groups, ["只有一段"]), null);
  const without = pairTranslations(groups, undefined);
  assert.equal(without?.length, 1);
  assert.equal(without?.[0].translation, null);
  assert.equal(without?.[0].paragraph.text, "甲乙丙丁");
});

test("pairTranslations：譯文段數等於原文段數（未合併）時逐段對應", () => {
  const groups = mergeParagraphSpans(splitParagraphSpans("甲。\n\n乙。"));
  const paired = pairTranslations(groups, ["甲嘅今譯。", "乙嘅今譯。"]);
  assert.deepEqual(paired?.map((entry) => entry.translation), ["甲嘅今譯。", "乙嘅今譯。"]);
});

test("wordAround：由光標向兩邊擴展到連續漢字，標點截斷", () => {
  assert.equal(wordAround("聖藥呢", 0), "聖藥呢", "短漢字連續段整段取");
  assert.equal(wordAround("白話報係中國人嘅聖藥", 3), "白話報係中國人嘅", "超過上限（8 字）以光標為中心截");
  assert.equal(wordAround("乜野叫做聖藥呢。白話報就係喇。", 5), "乜野叫做聖藥呢", "句號截斷");
  assert.equal(wordAround("見「聖藥」二字", 2), "聖藥", "引號截斷");
  assert.equal(wordAround("abc def", 1), "abc", "拉丁詞按空白截斷");
});

test("wordAround：標點位、越界回 null；過長連續段按光標居中截取", () => {
  assert.equal(wordAround("甲乙。丙丁", 2), null, "光標落喺標點");
  assert.equal(wordAround("甲乙", 9), null);
  assert.equal(wordAround("", 0), null);
  assert.equal(wordAround("一二三四五六七八九十", 5, 4), "四五六七", "以光標為中心截 4 字");
  assert.equal(wordAround("一二三四五六七八九十", 0, 4), "一二三四", "近段首時由頭截");
});
