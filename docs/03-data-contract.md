> 状态：草案（2026-10-05）｜本文档随实现演进，以代码与单一事实源为准。

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
| 归一化检索文本 | 构建期产物（映射表版本化） | `src/utils/normalize.ts` | 同字简转繁映射（现收 41 字）+ 去空白，检索正确性的核心；不同的字（如 嘢 / 野）与异体字一律不归并；罗马字归一未实现 |
| FTS5 索引 | D1 虚拟表 | `scripts/sync-corpus.mjs` → `db/import.sql` → D1 | trigram tokenizer，见 02 §6 |
| 粤拼音表 | `src/data/generated/<corpus>/<issue>/jyutping.json`（构建期产物，提交 git） | `scripts/sync-corpus.mjs` 读姊妹仓 `Jyutman-Corpus/translations/jyutping/<corpus>.jyutping.json`（tojyutping 生成），按叶拆分并把下标换算到本站正文 | 文章 id → `[字在正文中的下标, 字, 粤拼]`；阅读器据此生成 `<ruby>`，见 04 §1.2 S1 |
| corrections 表 | D1 | Workers API 接收用户提交 | 见 §7 |
| 影像 manifest | Jyutman-Images 仓 | 同步脚本生成 | object key / 尺寸 / checksum / 来源 / 许可 / 页码映射 |
| 书本单页派生图 | R2 | 构建期渲染 | 书本类源为 PDF，派生单页图（见 02 §7，待决策） |

**原则**：衍生层一律可重建：任何时候都能从上游 jsonl 重跑同步脚本恢复。因此衍生层不进 Git（例外：manifest 与映射表这类需要版本化的纯文本）。归一化映射表放在 Jyutman-Corpus 还是 Jyutman 代码侧：**待决策**；无论哪种，索引构建时必须记录映射表版本号。

## 7. corrections 回写流程

```text
用户提交 diff（阅读页正文选区 → 右栏「報錯」表单）
  → POST /api/correct（Workers；防滥用：IP 令牌桶 + 蜜罐字段，Turnstile 待接）
  → D1 corrections 表（pending）
  → 审阅（维护者用内部校对工作台；v1 为 admin token 鉴权，升级路径为 Cloudflare Access）
  → accepted 由维护者在工作台导出 JSON / CSV
  → 人工整理后向上游提 PR（首选 JyutmanDataPipeline；若不再维护则 Jyutman-Corpus）
  → 是否合并由上游/维护者决定；本站绝不直接改上游
```

表结构（已实现，见 `db/migrations/0001-corrections.sql`）：

```sql
CREATE TABLE corrections (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id      TEXT NOT NULL,
  page_id         TEXT,                       -- <corpus>/<issue>/<三位叶码>，由 articles 表推出
  span_start      INTEGER,                    -- 选填：所选文字在该篇正文中的码点区间 [start, end)
  span_end        INTEGER,
  fragment        TEXT NOT NULL,              -- 原文片段引用（前 20 字 + 所选 + 后 20 字）
  selected_text   TEXT NOT NULL,
  paragraph_index INTEGER,                    -- 显示段落序号（合并渲染之后）
  type            TEXT NOT NULL,              -- 錯字 / 缺字 / 標點分段 / 今譯疑問 / 其他
  suggestion      TEXT,
  note            TEXT,                       -- 保留字段
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending / accepted / rejected / deferred
  created_at      TEXT NOT NULL
);
CREATE INDEX idx_corrections_fragment ON corrections (fragment);
CREATE INDEX idx_corrections_article  ON corrections (article_id);
CREATE INDEX idx_corrections_status   ON corrections (status);
```

**已定**：主定位方式仍是原文片段引用（`fragment`），对上游文本变动更稳；字符偏移（`span_start` / `span_end`）自 2026-10-05 起作为选填辅助定位写入。

**`span_start` / `span_end`**（选填，`server/routes/corrections.ts` 的 `readSpan`）：

- 语义：所选非空白字在该篇文章正文（上游 `text`，未经合并渲染）中的 Unicode 码点下标，半开区间 `[span_start, span_end)`；不计粤拼注音。阅读器由正文各片的 `data-o` 起始下标换算（`selectionSpan`），选区落在篇名或今译时送 `null`。
- 校验：两者须同时提供或同时缺省（`undefined` 与 `null` 都算缺省）；只给一个返回 400「區間起點同終點要一齊提供」；各自须为 0 至 100000 的整数（数字或数字字符串）；`span_end` 小于 `span_start` 返回 400；不按文章实际长度校验。
- 存储：原样写入同名列；缺省则为 `NULL`（旧客户端兼容）。`GET /api/reports` 与 `GET /api/queue` 暂不返回这两列，工作台导出也不含。

**匿名与隐私**：不收任何联系方式；表内不存提交者、IP、UA 等可识别资料；防滥用只靠 IP 令牌桶（内存态）与蜜罐字段。

**接口**（`server/routes/corrections.ts`）：`POST /api/correct`、`GET /api/reports?article_id=`、`GET /api/queue`（需 `Authorization: Bearer <ADMIN_TOKEN>`）、`POST /api/adjudicate`（同上）。维护令牌由 `npx wrangler secret put ADMIN_TOKEN` 写入，代码与仓库不存任何令牌。

**待办**：Turnstile（需先建 widget）；上游回写仍为人工导出，不自动化。

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

- 登记表落点已定：`Jyutman-Corpus` 仓 `rights/` 目录（`0.3-rights-registry.csv` 主表与 `0.3-rights-summary.md` 说明，Phase 0 已产出首版：5 已核 / 4 待核）；站点 `/data` 页渲染摘要版本（页面结构见 04 §2.1）。
- 影像政策：本站预设只公开 OCR 文本层；扫描影像在完成藏馆条款逐件核查前不公布。登记表的「扫描件条款」字段是日后开放影像的审批依据。
- **待验证**：扫描件条款与 OCR 文本层许可的兼容性需逐件确认。
- 研究语料库（HKUST / EdUHK / PolyU 等）：走**合作授权**，不下载转载。
- Takedown 通道：站点提供 GitHub Issues 联系渠道（`huangjunxin/Jyutman` 仓 Issues）；收到通知后先下架对应内容，再核证并记录处理结果。

## 9. Schema 校验与容错

- 同步脚本对每行做 Zod 校验：未知字段 passthrough 不报错；缺必需字段 → 跳过该行并计入告警（不中断整批）。
- 每次同步记录：源 release / commit、总行数、跳过行数、归一化映射表版本 → 写入 D1 `sync_meta` 表（或构建产物），关于页可查。
- 契约变更（上游加字段、改 ID 格式）：本站先容错，再同步更新本文档与 `types/`。

## 10. 相关文档

- `docs/02-technical-architecture.md`：检索字段、存储选型、如何消费这些数据
- `docs/05-deployment.md`：数据同步 workflow 与部署流程
