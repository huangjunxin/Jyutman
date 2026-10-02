# 派生數據

本目錄全部係派生數據，可由 `scripts/sync-corpus.mjs` 重建（讀上游 `JyutmanDataPipeline/data/<corpus>/*.jsonl` 發佈層）：

- `manifest.json`：語料級摘要（標題照錄底本原名、年代、葉數、篇數、校對進度、掃描來源）。
- `<corpus>/issues.json`：期號清單（日期、考證說明、葉數、篇數、已核驗與待校葉數）。
- `<corpus>/<issue>/pages.json`：葉級頁面數據，每葉 `{page, status, blocks}`；`blocks` 由文章切分而來，`type` 為 `article`（`id` / `title` / `seq` / `text` / `text_norm`）或 `marker`（整段版面標記，如 ［插圖］［空白頁］［現代襯頁］）。

重建指令：`node scripts/sync-corpus.mjs`。請勿手改本目錄任何文件；上游字段語義與容錯見 `docs/03-data-contract.md`。
