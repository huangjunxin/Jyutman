/**
 * 五批功能接線守衛：重設計（PR #1）之後，逐項核對功能仍然接喺新設計體系上。
 * 呢啲斷言睇源碼標記（頁面 markup / 純函數引用 / API 欄位），防止將來改版靜靜哋整走功能。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const readPage = read("src/pages/read/[corpus]/[issue]/[page].astro");
const searchPage = read("src/pages/search/index.astro");
const indexPage = read("src/pages/index.astro");
const browsePage = read("src/pages/browse/[corpus].astro");
const proofreadPage = read("src/pages/proofread/index.astro");
const baseLayout = read("src/layouts/Base.astro");
const searchBar = read("src/components/SearchBar.astro");
const robots = read("public/robots.txt");
const readerUtil = read("src/utils/reader.ts");
const searchView = read("src/utils/search-view.ts");
const serverIndex = read("server/index.ts");
const serverSearch = read("server/routes/search.ts");
const serverCorrections = read("server/routes/corrections.ts");
const hostPolicy = read("src/utils/host-policy.ts");

test("① 粵拼 ruby 層：注音渲染、開關、豎排讓位", () => {
  assert.match(readPage, /renderParagraphSegments/u, "閱讀頁用共用注音渲染");
  assert.match(readPage, /data-pref="jp"/u, "有粵拼注音開關");
  assert.match(readPage, /rd-nojp/u, "有唔注音狀態 class");
  assert.match(readPage, /rd-nojp[\s\S]{0,120}rt[\s\S]{0,60}display:\s*none/u, "關咗注音時 rt 要收埋");
  assert.match(readPage, /writing-mode:\s*vertical-rl/u, "豎排");
});

test("② 今譯層：並行分組、譯塊、未校訂角標、開關", () => {
  assert.match(readPage, /mergeParagraphSpans/u);
  assert.match(readPage, /pairTranslations/u);
  assert.match(readPage, /class="tr tr-inline"|"tr tr-inline"/u, "譯塊跟住原文段");
  assert.match(readPage, /譯 v0 · 未校訂/u, "未校訂角標");
  assert.match(readPage, /data-pref="tr"/u, "今譯開關");
  assert.match(readPage, /rd-notr/u);
});

test("③ 碎段合併：句末標點判定與連排仍在純函數層", () => {
  assert.match(readerUtil, /export function endsWithSentenceEnd/u);
  assert.match(readerUtil, /export function mergeParagraphSpans/u);
  assert.match(readerUtil, /export function paragraphJoin/u);
  assert.match(readPage, /mergeParagraphSpans\(splitParagraphSpans\(block\.text\)\)/u, "閱讀頁建構期真係用咗");
});

test("④ 文章錨點：篇 id、錨鏈、檢索直達", () => {
  assert.match(readPage, /id=\{view\.id\}/u, "篇塊帶上游 id");
  assert.match(readPage, /art-anchor/u, "篇級錨鏈");
  assert.match(readPage, /data-copy-anchor/u, "撳錨鏈複製連結");
  assert.match(searchView, /#\$\{hit\.id\}/u, "檢索命中連去 #id");
  assert.match(searchView, /hl=/u, "命中同時帶 ?hl= 高亮字");
});

test("⑤ JSON-LD：首頁、書目頁、閱讀頁都有", () => {
  for (const [name, page] of [
    ["首頁", indexPage],
    ["書目頁", browsePage],
    ["閱讀頁", readPage],
  ]) {
    assert.match(page, /import JsonLd/u, `${name}要 import JsonLd`);
    assert.match(page, /<JsonLd/u, `${name}要渲染 JsonLd`);
  }
});

test("⑥ 報錯通道：選字帶入、類型、蜜罐、已回報角標、API 校驗", () => {
  assert.match(readPage, /rp-form/u, "報錯表單");
  assert.match(readPage, /CORRECTION_TYPES/u, "問題類型 chips");
  assert.match(readPage, /rp-hp|name="website"/u, "蜜罐欄位");
  assert.match(readPage, /class(?:Name)?\s*=\s*"reported"|"reported"/u, "已回報角標");
  assert.match(readPage, /\/api\/correct/u, "提交去 API");
  assert.match(serverCorrections, /website/u, "服務端蜜罐檢查");
  assert.match(serverCorrections, /span_start/u, "服務端收正文區間");
});

test("⑦ 校對工作台：頁在、noindex、robots 屏蔽、隊列與裁決接線", () => {
  assert.match(proofreadPage, /noindex/u);
  assert.match(proofreadPage, /\/api\/queue/u);
  assert.match(proofreadPage, /\/api\/adjudicate/u);
  assert.match(proofreadPage, /jm-admin/u, "維護令牌存 sessionStorage");
  assert.match(robots, /Disallow: \/proofread/u);
});

test("⑧ 檢索高亮：KWIC 命中字用 mark 包住", () => {
  assert.match(searchPage, /el\("mark", "hit__kw"/u, "命中字 <mark class=\"hit__kw\">");
  assert.match(serverSearch, /locateAndSlice/u, "服務端出 pre / highlight / post");
});

test("⑨ 引用導出：三種格式面板 + 複製", () => {
  assert.match(readPage, /buildCitations/u);
  assert.match(readPage, /cite-panel-\$\{format\.key\}/u, "三種格式面板由 citeFormats 生成");
  for (const key of ["text", "bibtex", "ris"]) {
    assert.match(readPage, new RegExp(`key: "${key}"`, "u"), `要有 ${key} 格式`);
  }
  assert.match(readPage, /cite-copy|已複製引用/u, "複製掣");
});

test("⑩ 檢索分頁：page / page_size / 載入更多 / 已顯示", () => {
  assert.match(searchPage, /page_size/u);
  assert.match(searchPage, /載入多/u, "載入更多掣");
  assert.match(searchPage, /已顯示 \$\{state\.shown\} \/ \$\{state\.total\}/u, "已顯示 X / 共 Y");
  assert.match(serverSearch, /page_size/u);
  assert.match(serverSearch, /total/u);
});

test("⑪ 檢索欄組件：首頁與檢索頁共用 SearchBar", () => {
  assert.match(indexPage, /import SearchBar/u);
  assert.match(searchPage, /import SearchBar/u);
  assert.match(searchBar, /role="search"/u);
  assert.match(searchBar, /name="q"/u);
  assert.match(searchBar, /action="\/search\/"/u);
});

test("⑫ 語料篩選：facet pills 由 API facets 驅動", () => {
  assert.match(searchPage, /facetPills/u);
  assert.match(searchPage, /payload\.facets/u);
  assert.match(serverSearch, /facets/u, "API 要回 facets 計數");
});

test("⑬ 頁腳與主機策略：新設計頁腳 + canonical/noindex 中間件", () => {
  assert.match(baseLayout, /foot-brand/u, "頁腳（西關滿洲窗標誌）");
  assert.match(baseLayout, /foot-nav/u);
  assert.match(hostPolicy, /export function decideHost/u);
  assert.match(serverIndex, /decideHost/u);
  assert.match(serverIndex, /X-Robots-Tag|withNoindex/u, "預覽域 noindex");
});

test("⑭ API 路由齊全：search / correct / reports / queue / adjudicate", () => {
  for (const route of ["/api/search", "/api/correct", "/api/reports", "/api/queue", "/api/adjudicate"]) {
    assert.match(serverIndex, new RegExp(route.replace(/\//gu, "\\/"), "u"), `要有 ${route}`);
  }
});
