> 状态：草案（2026-10-02）｜本文档随实现演进，以代码与单一事实源为准。

# 数据契约

本文档定义本站与上游数据管道 JyutmanDataPipeline 之间的消费契约、字段语义、已知坑，以及本站自有的衍生数据层。消费这些数据的技术组件（同步脚本、D1 表、检索字段）见 `docs/02-technical-architecture.md`；数据同步在部署流程中的位置见 `docs/05-deployment.md`。

## 1. 契约边界

- **唯一消费点**：上游的发布层 `data/<corpus>/{articles,pages,issues}.jsonl`。
- **绝不消费 `work/` 层**：`work/` 下的 `page_XXX.md`、`book.md` 等是管道内部工作产物，格式不稳定、随时可能变。
- **绝不回写上游**：本站的校对结果先进本站 corrections 表，经审阅后由 GitHub Actions 定期向上游提 PR；是否合并由上游决定（见 §7）。
- 编码：jsonl 每行一个 JSON 对象，UTF-8（`ensure_ascii=False`）。
- 时效：上游发布 release 后本站才同步；本站不追踪上游未发布的前沿状态。

## 2. 数据模型总览

```text
corpus（语料 slug，如 gd-vernacular-paper / canton-vernacular-handbook；注意 corpus slug ≠ 文章 ID 前缀 gdvp / cvh / rcc）
  └─ issue（期号）
       └─ page（叶）
            └─ article（文章；一篇 = 某一叶上的一段连续文本）
```

三层产物一一对应三个 jsonl：`issues.jsonl`（期号元数据）、`pages.jsonl`（整页全文）、`articles.jsonl`（切分后的文章）。文章是检索与展示的基本单位，叶是影像的基本单位。

## 3. articles.jsonl

字段（以下为结构示意，字段值为占位，非真实数据）：

```jsonl
{"id":"<前缀>-<期>-<页>-<序>","corpus":"...","issue":"...","issue_date":"...","page":"...","seq":0,"source_image":"...","title":null,"text":"...\n\n...","unclear":[],"status":"draft"}
```

| 字段 | 类型 | 语义与注意事项 |
|---|---|---|
| `id` | string | 格式 `<前缀>-<期>-<页>-<序>`（示例 `gdvp-01-009-01`）。**前缀表目前只覆盖 3 个语料；新语料会退化为整条 slug 作前缀**，下游不得写死 ID 格式（见坑清单 ④） |
| `corpus` | string | 语料代号 |
| `issue` | string | 期号（在该语料内唯一） |
| `issue_date` | string \| null | 依赖上游 `ISSUE_INFO` 表；新语料可能为 null，UI 与排序必须容忍 |
| `page` | number | 扫描叶序号（整数，已实测确认；是 URL 与影像定位的主键，不是原书印刷叶码） |
| `seq` | number | 该叶内的文章序号 |
| `source_image` | string | 报纸：单页 JPG；**书本：整本 PDF**，没有单页影像，需本站自行渲染派生或链 PDF（见坑 ⑦，方案见 02 §7） |
| `title` | string \| null | 无题文章为 null，UI 需给无题文章生成显示名（如「（无题）」+ 首句） |
| `text` | string | 正文，含 `\n\n` 分段；**三语混排**：汉字 + 传教士罗马字 + 英文同处一个字段（见坑 ⑤） |
| `unclear` | array | 目前恒为空数组。疑点实际在上游 `work/*/review_checklist.md`，尚未结构化，**不要为它设计 UI**（见坑 ③） |
| `status` | string | `draft` / `verified` / `needs_review`，页级状态传播而来（见坑 ②） |

## 4. pages.jsonl 与 issues.jsonl

### 4.1 pages.jsonl

整页全文 + 该叶的文章数 + 与文章一致的 `status`。

- 通读形态：阅读器可以先取整页全文再叠文章切分。
- 字段（已对 `gd-vernacular-paper` 实测）：`corpus` / `issue` / `issue_date` / `page`（int）/ `source_filename` / `source_image` / `text` / `unclear` / `articles`（int）/ `status`。上游 schema 可能演进，同步脚本仍需对未知字段容错。

### 4.2 issues.jsonl

- 期号元数据（期号、日期、语料等）。
- `verified_pages` / `needs_review_pages` 统计：用于期号页展示校对进度。
- `date_note`：期号日期的考证过程说明，属研究性内容，应展示而非丢弃。
- 字段（已实测）：`corpus` / `issue` / `issue_date` / `date_note` / `pages`（int）/ `articles`（int）/ `verified_pages`（int）/ `needs_review_pages`（int）/ `workspace`（上游工作区路径，仅内部参考，不对外展示）。

## 5. 已知坑清单（必须全部处理）

| # | 坑 | 影响 | 本站应对 |
|---|---|---|---|
| ① | 上游只有 3 个语料已发布；另 6 个只有工作层，未跑 `build_data.py` | 第一版内容量有限 | 第一版只上线 `gd-vernacular-paper` / `canton-vernacular-handbook` / `readings-in-cantonese-colloquial`；语料列表由数据驱动，不写死常量 |
| ② | 正文可能含 `□`（未识别字）；`status` 有 draft / verified / needs_review | 用户可能读到未校对内容 | 按 status 过滤或标注（UI 明示校对状态徽标）；`□` 用独立样式渲染，不静默丢弃 |
| ③ | `unclear` 恒为空 | 展示疑点的功能没有数据源 | 不要为它设计 UI；上游把 review_checklist 结构化后再接 |
| ④ | ID 前缀会退化（新语料前缀 = 整条 slug） | 解析 ID 的代码会崩 | ID 当不透明键；路由参数用完整 ID + URL 编码；解析失败退化为整体 slug |
| ⑤ | 三语混排（汉字 + 传教士罗马字 + 英文）在同一 `text` 字段 | 排版、字体、检索混在一起 | 自建分段策略（按段落 + 字符集切换）；检索侧另建罗马字归一字段（见 02 §6.2） |
| ⑥ | 正文含标记 `［插圖］` / `［空白頁］` / `［現代襯頁］` | 直接当正文渲染会很怪 | 渲染时特判为占位块 / 插图位 / 说明文字，并映射到对应影像区域（若可得） |
| ⑦ | 报纸扫描仅约 968×1452px | 深缩放体验有限 | 阅读器限制最大放大倍率并在 UI 明示；书本类需本站渲染单页图 |
| ⑧ | `source_image` 含中文文件名 | 上传与 URL 处理会出错 | 上传 R2 时改写为 ASCII object key；manifest 保留「原文件名 ↔ object key」映射并做 URL 编码 |
| ⑨ | `genre` / `column` / `series` / `author` 是上游预留字段，尚未出现 | 基于「字段不存在」的硬编码将来会失效 | Schema 用 passthrough 容错；UI 对这些字段做「有则显示」 |

## 6. 本站衍生数据层（本站拥有，上游没有）

| 衍生数据 | 存放 | 生成方式 | 说明 |
|---|---|---|---|
| 归一化检索文本 | 构建期产物（映射表版本化） | `scripts/normalize.ts` | 繁简 / 异体映射 + 罗马字归一，检索正确性的核心 |
| FTS5 索引 | D1 虚拟表 | `scripts/build-fts.ts` → D1 import | trigram tokenizer，见 02 §6 |
| corrections 表 | D1 | Workers API 接收用户提交 | 见 §7 |
| 影像 manifest | jyutman-images 仓 | 同步脚本生成 | object key / 尺寸 / checksum / 来源 / 许可 / 页码映射 |
| 书本单页派生图 | R2 | 构建期渲染 | 书本类源为 PDF，派生单页图（见 02 §7，待决策） |

**原则**：衍生层一律可重建：任何时候都能从上游 jsonl 重跑同步脚本恢复。因此衍生层不进 Git（例外：manifest 与映射表这类需要版本化的纯文本）。归一化映射表放在 jyutman-corpus 还是 jyutman 代码侧：**待决策**；无论哪种，索引构建时必须记录映射表版本号。

## 7. corrections 回写流程

```text
用户提交 diff（阅读页的 CorrectionForm island）
  → POST /api/correct（Workers；防滥用：Turnstile + 速率限制，Phase 3 上线时启用）
  → D1 corrections 表（pending）
  → 审阅（维护者经 Cloudflare Access 保护的审阅界面操作）→ accepted / rejected / deferred
  → GitHub Actions 定期把 accepted 整理成 PR：
       · 首选指向 JyutmanDataPipeline（上游）
       · 若上游不再维护，则指向 jyutman-corpus
  → 是否合并由上游/维护者决定；本站绝不直接改上游
```

建议的表结构（草案，待实现时定稿）：

```sql
CREATE TABLE corrections (
  id          INTEGER PRIMARY KEY,
  article_id  TEXT NOT NULL,
  page_id     TEXT,
  span_start  INTEGER,          -- 待决策：字符偏移 vs 引用片段
  span_end    INTEGER,
  suggestion  TEXT NOT NULL,
  note        TEXT,
  submitter   TEXT,             -- 匿名或哈希，不存 PII
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending/accepted/rejected
  created_at  TEXT NOT NULL
);
```

**待决策**：定位方式用字符偏移（简单，但对上游文本变动脆弱）还是原文片段引用（稳，但有匹配歧义）。

上游 checklist 结构化产物（review_items）入库后与 corrections 同队列呈现，按 article_id 与位置归组，同位置读者上报自动合并不重复展示。

## 8. 版权与许可登记

逐件登记表字段建议：

| 字段 | 说明 |
|---|---|
| corpus | 语料 slug（如 `gd-vernacular-paper`；文章 ID 前缀是另一套标识，如 `gdvp`，勿混用） |
| 底本 | 文献名与卷/期 |
| 年代 | 1842–1907 内的具体年份 |
| 扫描来源机构 | 如 Cornell / UC Berkeley |
| Internet Archive ID | 用于回溯扫描件 |
| 底本公有领域依据 | 出版年与保护期判定 |
| 扫描件条款 | IA 条目上标注的条款 |
| OCR 文本层许可 | CC BY-SA 4.0 |
| 状态 | 已核 / 待核 / 有风险 |

- 登记表落点已定：`Jyutman-corpus` 仓 `rights/` 目录（`0.3-rights-registry.csv` 主表与 `0.3-rights-summary.md` 说明，Phase 0 已产出首版：5 已核 / 4 待核）；站点 `/data` 页渲染摘要版本（页面结构见 04 §2.1）。
- 影像政策：本站预设只公开 OCR 文本层；扫描影像在完成藏馆条款逐件核查前不公布。登记表的「扫描件条款」字段是日后开放影像的审批依据。
- **待验证**：扫描件条款与 OCR 文本层许可的兼容性需逐件确认。
- 研究语料库（HKUST / EdUHK / PolyU 等）：走**合作授权**，不下载转载。
- Takedown 通道：站点提供联系邮箱与表单；收到通知后先下架对应内容，再核证并记录处理结果。

## 9. Schema 校验与容错

- 同步脚本对每行做 Zod 校验：未知字段 passthrough 不报错；缺必需字段 → 跳过该行并计入告警（不中断整批）。
- 每次同步记录：源 release / commit、总行数、跳过行数、归一化映射表版本 → 写入 D1 `sync_meta` 表（或构建产物），关于页可查。
- 契约变更（上游加字段、改 ID 格式）：本站先容错，再同步更新本文档与 `types/`。

## 10. 相关文档

- `docs/02-technical-architecture.md`：检索字段、存储选型、如何消费这些数据
- `docs/05-deployment.md`：数据同步 workflow 与部署流程
