# 粵語文叢 Jyutman

**歷史粵語白話文獻嘅 OCR 數碼化同網頁閱讀平台**
*An open reading platform for historical Cantonese vernacular texts.*

**狀態**：規劃階段 ｜ **授權**：代碼 MIT · 數據 CC BY-SA 4.0 ｜ **規劃網域**：jyutman.com

> 各項進度以 [docs/06-roadmap.md](docs/06-roadmap.md) 為準；本檔唔維護獨立嘅進度數字。

---

## 一句話

粵語文叢係一個致力保存同傳播粵語文化嘅開放平台，將 1842–1907 年間出版嘅粵語白話文獻（傳教士教科書、方言報紙、讀本）由掃描影像變成可檢索、可對照、可引用嘅網頁文本。

## 項目淵源

本站獨立開發、獨立發佈，唔隸屬於任何其他項目。以下係本站嘅數據來源同設計參考：

| 來源 | 角色 |
|---|---|
| JyutmanDataPipeline | 數據來源：OCR 文本同元數據嘅產出方；本站只讀其公開發佈層 |
| 粵語辭叢 | 設計參考：獨立嘅粵語辭典集合站；本站嘅閱讀器同界面概念受其啟發，兩者無隸屬關係 |

本站**只讀**數據管道產出嘅 `data/<corpus>/{articles,pages,issues}.jsonl`，唔會回寫。`articles` 係主要展示單元，欄位包括 `id` / `corpus` / `issue` / `issue_date` / `page` / `seq` / `source_image` / `title` / `text` / `unclear` / `status`；`status` 取值 `draft` / `verified` / `needs_review`，頁面層狀態會傳播到文章層。

## 語料一覽

底本全部係 1842–1907 年出版物，屬公有領域；掃描影像來自 Internet Archive，當中包括 Cornell University Library 藏本。

| 語料 | corpus slug | 年代 | 頁數 | 狀態 |
|---|---|---|---|---|
| 廣東白話報 | `gd-vernacular-paper` | 1907 | 221（4 期） | 已發佈 269 篇 |
| A Handbook of the Canton Vernacular | `canton-vernacular-handbook` | 1874 | 248 | 已發佈 329 篇 |
| Readings in Cantonese Colloquial | `readings-in-cantonese-colloquial` | 1894 | 220 | 已發佈 268 篇 |
| Cantonese Apothegms | （無） | 1902 | 170 | 僅工作層 |
| Chinese-English Phrase Book | （無） | 1888 | 224 | 僅工作層 |
| Easy Lessons in Chinese | （無） | 1842 | 316 | 僅工作層 |
| How to Speak Cantonese | （無） | 1902 | 268 | 未 OCR |
| Select Phrases and Reading Lessons | （無） | 1864 | 83 | 未 OCR |
| Gospel of St. Mark（粵語） | （無） | 1899 | 96 | 僅工作層 |

**已發佈合計：689 頁 / 866 篇 / 約 79 萬字符。**

文本特點：漢字 + 19 世紀傳教士羅馬字 + 英文三語混排，無現代粵拼標註；正文含 ［插圖］ / ［空白頁］ / ［現代襯頁］ 等版面標記。

## 點解要做呢件事

1842–1907 年係粵語白話書面文獻嘅一個特殊時期：傳教士用粵語寫教科書同讀本，報人用粵語辦報，句式同今日口語相當接近，但寫法混雜漢字、19 世紀羅馬字同英文。呢批材料對語言史、社會史同粵語教學都有價值，但長期停留喺圖書館特藏同掃描影像層面。

另一邊廂，識典古籍同 ctext.org 已經示範咗古籍閱讀器可以做到幾好：圖文對照、段落對齊、穩定標識。粵語文獻欠缺嘅唔係技術想像力，而係一個將 OCR 產出整理成可讀、可查、可引用嘅展示層。本站就係補呢一層。

| 讀者 | 佢想要嘅嘢 | 今日嘅障礙 |
|---|---|---|
| 語言研究者 | 查一個詞喺 19 世紀文獻嘅用例 | 只能逐頁翻影像 |
| 粵語學習者 | 讀到有註音、有釋義嘅舊文本 | 豎排、羅馬字拼式睇唔明 |
| 一般讀者 | 睇得明、睇得順 | 唔知有呢批文獻存在 |
| 開發者 | 拎到乾淨、有授權嘅文本數據 | 數據格式唔統一、無公開入口 |

## 核心特性願景

| 特性 | 內容 | 目標階段 |
|---|---|---|
| 文本閱讀＋來源信息 | OCR 文本分章閱讀，附底本、藏館、葉碼等來源信息；影像對照待逐件版權核查後開放 | Phase 1 |
| 豎排閱讀 | 支援傳統豎排（右起）同橫排兩種排版，可即時切換 | Phase 1 |
| 翻頁導航 | 頁內翻頁、跳頁，URL 反映當前位置 | Phase 1 |
| 繁簡異體歸一檢索 | 輸入簡體或異體字，都查得到對應繁體原文 | Phase 2 |
| 粵拼標註 | 為已校對文本加註現代粵拼（Jyutping），以 ruby 形式呈現 | Phase 2 |
| 現代粵文今譯 | 將舊時用字同寫法嘅文獻譯成今日通行粵文，段落對照顯示 | Phase 2 |
| 英譯粵 | 英文底本課文附現代粵文翻譯 | Phase 2 |
| 歷史拼式 | 保留並可檢索 19 世紀傳教士羅馬字拼式，並同現代粵拼對齊 | Phase 2 |
| 字典懸浮釋義 | 選字浮出釋義（外連粵語辭叢、粵典 words.hk 等公開詞典） | Phase 2 |
| 引用導出 | 每篇有永久 URL，可導出引用格式 | Phase 2 |
| 開放數據 | 文本、影像清單、站點代碼三者分開發佈，均可自由取用同引用 | Phase 3 |
| 眾包糾錯 | 讀者可以提交更正，經審核後回流數據管道 | Phase 3 |

## 一個讀者嘅路徑

Phase 1 之後，一個普通讀者應該可以：

1. 喺首頁或書目庫揀「廣東白話報 1907」。
2. 打開某一期某一頁，讀到分章嘅 OCR 文本。
3. 見到該葉嘅來源信息（底本、藏館、葉碼、校對狀態），同正文嘅校對注。
4. 喺搜尋欄輸入「廣東」，得到跨語料嘅命中清單，每條顯示語料、頁碼同上下文。
5. 複製該頁嘅永久連結，貼入論文註腳。

## 倉庫佈局（規劃）

| 倉庫 | 內容 | 授權 |
|---|---|---|
| `jyutman` | 本站點代碼（Astro + Cloudflare） | MIT |
| `jyutman-corpus` | 文本數據（數據管道產出嘅 jsonl） | CC BY-SA 4.0 |
| `jyutman-images` | 影像清單同來源登記 | 見該倉庫說明 |

三個倉庫各自獨立發佈，唔互相依賴構建；本站讀取另外兩個倉庫嘅公開產出。

## 技術方向

Astro 靜態前端 + Cloudflare Workers API + D1（SQLite FTS5 trigram）全文檢索 + R2 影像儲存 + Pagefind 站內檢索；數據開源採三倉分離（站點代碼 / 文本數據 / 影像清單）；影像瀏覽（待逐件版權核查通過後啟用）用 OpenSeadragon，構建期預生成瓦片，並預留 IIIF 演進路徑。

詳細技術選型、邊界同契約見 [docs/01-vision-and-scope.md](docs/01-vision-and-scope.md)；分階段計劃見 [docs/06-roadmap.md](docs/06-roadmap.md)。

## 文檔導航

| 文檔 | 內容 |
|---|---|
| [README.md](README.md) | 項目簡介、語料一覽、授權（本檔） |
| [docs/01-vision-and-scope.md](docs/01-vision-and-scope.md) | 背景、願景、目標與非目標、項目邊界、質量基線、風險 |
| [docs/02-technical-architecture.md](docs/02-technical-architecture.md) | 技術架構 |
| [docs/03-data-contract.md](docs/03-data-contract.md) | 數據契約 |
| [docs/04-features-and-ui.md](docs/04-features-and-ui.md) | 功能與界面規劃 |
| [docs/05-deployment.md](docs/05-deployment.md) | 部署方案 |
| [docs/06-roadmap.md](docs/06-roadmap.md) | 分階段路線圖、里程碑、當前狀態 |

> 文檔編號 01–06 依次覆蓋願景、架構、數據契約、功能界面、部署、路線圖。文檔與實現保持單一事實源，如有脫節以代碼為準。

## 貢獻

項目處於規劃階段，暫未開放代碼貢獻。有興趣參與（校對、數據、前端、粵語內容）可以先開 issue 講低方向。聯絡：huang-junxin@qq.com

## 授權

| 對象 | 授權 |
|---|---|
| 站點代碼（`jyutman`） | MIT |
| 文本數據（`jyutman-corpus`） | CC BY-SA 4.0 |
| 影像清單（`jyutman-images`） | 見該倉庫說明 |
| 底本文獻（1842–1907 出版物） | 公有領域 |

掃描影像來自 Internet Archive，部分藏本來自 Cornell University Library；使用時請一併標明來源。

**關於參考站點**：識典古籍（shidianguji.com）同 ctext.org 僅作 UX 參照，唔係數據源。ctext.org 明確禁止爬取，本項目不會抓取其任何內容。

## 當前狀態

**規劃階段。** 三個倉庫尚未初始化，Phase 0 未開始。

各階段目標、任務同驗收標準見 [docs/06-roadmap.md](docs/06-roadmap.md)。
