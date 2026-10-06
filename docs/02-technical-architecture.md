> 状态：草案（2026-10-06）｜本文档随实现演进，以代码与单一事实源为准。

# 粤语文丛 Jyutman 技术架构

粤语文丛 Jyutman 是 1842–1907 年历史粤语白话文文献（粤语报纸与教材）的 OCR 展示站。底本属公有领域，扫描件来自 Internet Archive，文本由上游数据管道 JyutmanDataPipeline 产出。设计参考：粤语辞丛（独立的粤语词典站）；两者无隶属关系。数据契约见 `docs/03-data-contract.md`，部署方案见 `docs/05-deployment.md`。

## 1. 目标与约束

| 约束 | 内容 |
|---|---|
| 部署 | Cloudflare（Workers + Static Assets），域名 jyutman.com |
| 成本 | $0–5/月（不含域名） |
| 数据 | 只消费上游发布层 jsonl，不回写上游（见 03） |
| 内容量级 | 文本几十 MB；影像目标 1–3 万页 / 10GB 起 |
| 端 | 桌面与移动浏览器、竖排阅读、文本可选中、SEO 可索引 |
| 许可 | 站点代码 MIT；OCR 文本 CC BY-SA 4.0 |

第一版非目标：账号体系、众包任务流、AI 辅助校对、动态 IIIF 影像服务（均保留演进接口，见 §11）。

## 2. 候选方案对比

| 维度 | A 纯静态 | B 均衡（推荐） | C 服务化 |
|---|---|---|---|
| 前端 | Astro 静态 | Astro 静态 | Next.js |
| 检索 | Pagefind | D1 SQLite FTS5 trigram（主）+ Pagefind（站内即时） | Meilisearch Cloud |
| 文本存储 | Git 仓库 | D1 | Postgres |
| 影像 | R2 + OpenSeadragon | R2 + OpenSeadragon（静态瓦片） | R2/S3 + 动态 IIIF |
| 校对回写 | 无 | D1 corrections 表 → GitHub PR | 账号 + 数据库 |
| 月成本 | $0 | $0–5 | $25–60+ |
| 主要缺陷 | Pagefind 中文模糊子串弱（issue #987 仍开放）；复杂排序与分面受限 | 需要自建同步与索引管线 | 早期过度设计 |

## 3. 为什么选 B（按重要性排序）

1. **检索质量必须自控。** 古籍与粤语的词典分词覆盖差（唔係 / 乜嘢 / 冇 这类口语词，以及大量异体字），必须自建「字符级 n-gram + 繁简归一 + 粤拼/历史拼式字段」三件套（繁简归一只做同一个字的简转繁，不同的字不归并，见 §6.2）。D1 + SQL 可以直接表达归一化字段与组合查询；Pagefind 是黑盒，分词与打分不可调。
2. **成本结构匹配。** 文本仅几十 MB，远小于 D1 免费 5GB；R2 出网永久免费；Workers 免费 10 万请求/日；静态资产由同一 Worker 直出（为统一加 canonical 跳转与预览域 noindex，`assets.run_worker_first` 为 `true`），全部请求计入 Workers 请求数，当前规模远低于额度。
3. **跟随 Cloudflare 平台方向。** 官方已明确新项目推荐 Workers + Static Assets 而非 Pages。Pages 静态文件数上限为免费 2 万 / 付费 10 万、单文件 ≤ 25 MiB，若「每页一个页面」会撞限；应对：按卷/章合并出页 + 页级内容客户端按 JSON 渲染，或升级静态资产档位（列入 §10 实测清单）。
4. **演进路径自然。** 静态 IIIF manifest → iiif-worker 动态裁切；众包走 Workers API；AI 走 Workers AI。

## 4. 框架对比

| 框架 | 定位 | 优势 | 本站判断 |
|---|---|---|---|
| Astro | 官方定位内容站 | islands 架构默认零 JS；Content Collections + Zod；内容页 JS 实测约 9KB | 采用 |
| Next.js | 全栈框架 | 生态最大；RSC 适合将来的账号/后台 | 纯内容站偏重（对比组中内容页 JS 实测约 463KB） |
| SvelteKit / Nuxt | 全栈框架 | 体积与开发体验好 | 仅在团队背景强时考虑 |

本站不采用 Nuxt：内容站适配度与默认产出体积是决定性因素（词典类站点需要应用态交互，文献展示站是内容驱动、SEO 与首屏体积优先）。阅读器与搜索做成 island（Svelte 或 React 组件按需 hydrate）。**待决策**：island 用 Svelte（体积更小）还是 React（生态与组件复用）。

## 5. 架构图

### 5.1 请求侧

```text
                     访问者（桌面 / 移动 / 搜索引擎爬虫）
                                  │
                                  ▼
                 ┌────────────────────────────────────┐
                 │  Cloudflare 边缘（CDN / TLS / 缓存） │
                 └────────────────┬───────────────────┘
                                  │
             ┌────────────────────┴────────────────────┐
             ▼                                         ▼
  静态资产（Astro dist/）                     Worker：API（Hono）
  /                首页                       /api/search    检索
  /browse/<c>      书目页                     /api/correct   校对提交
  /read/<c>/<i>/<p> 页/篇页（按卷合并）        /api/iiif/*    动态裁切（后续）
              │                                         │
              │                              ┌──────────┴──────────┐
              │                              ▼                     ▼
              │                        D1（SQLite）           R2（影像、瓦片）
              │                        articles / pages / issues
              │                        FTS5 trigram 索引
              │                        corrections
              ▼
      R2 桶（影像 + 预生成瓦片，自定义域直出）
```

说明：静态资产与 API 由同一个 Worker 承载（`assets.run_worker_first` 为 `true`）；Worker 入口先做主機策略（canonical 跳转、预览域 noindex），再分派 `/api/*` 与资产层。

### 5.2 构建 / 数据侧（离线，GitHub Actions）

```text
JyutmanDataPipeline（上游：Python + GLM-OCR 远程服务 + PyMuPDF）
  └─ data/<corpus>/{articles,pages,issues}.jsonl   ← 唯一消费点（见 03-data-contract.md）
        │  发布 release / 快照
        ▼
  Jyutman-Corpus（语料快照仓，CC BY-SA 4.0）
        │
        ▼
  scripts/sync-corpus.ts（sync-data workflow）
        ├─ Zod 校验 → 归一化（同字繁简；罗马字拼式待做）
        ├─ 构建 FTS5 索引 → D1（全量重建 + 原子表切换）
        └─ 影像与瓦片 → R2（object key 改写为 ASCII）
        │
        ▼
  Astro 构建（读取构建期元数据 / 清单）→ dist/ → wrangler deploy（Workers Static Assets）
```

## 6. 检索设计

### 6.1 为什么不能依赖分词

- SQLite FTS5 的 `unicode61` 不切中文：一整段连续汉字会被当作单个 token，只能从头前缀匹配，子串检索失效。
- 正确姿势是 trigram tokenizer（SQLite ≥ 3.34）：天然子串匹配，3 字及以上直接对整串做短语 `MATCH`；**不能再用前缀 `*` 语法**。1 至 2 字查询无三元组可构造，需降级到 bigram / unigram 辅助表或 LIKE，见 `docs/spikes/0.1-d1-trigram.md`。
- 中文 IR 学界结论：词索引与 n-gram 索引检索效果相当。不要指望 jieba 类分词覆盖粤语口语词（唔係 / 乜嘢 / 冇）与古籍异体字。
- Pagefind 官方支持 CJK 分词，但曾出现索引端与查询端分词不一致的问题；本站只把它作为站内即时搜索的补充，不作主检索。

### 6.2 索引字段设计

| 字段 | 内容 | 生成 | 用途 |
|---|---|---|---|
| `text_norm` | 同字简转繁 + 去空白后的正文；不同的字（如 嘢 / 野）、异体字一律不归并 | 构建期映射表（`src/utils/normalize.ts`，现收 41 字） | 主检索 |
| `text_raw` | 原始 OCR 文本 | 直接来自 jsonl | 命中片段回显 / 兜底 |
| `roman_norm` | 传教士罗马字 + 粤拼的归一形式（数字调与去声调并存） | 构建期（未实现） | 拉丁文与拼音检索 |

粤语特有需求：用户会用粤拼（`nei5 hou2`）与传教士拼式检索，因此拼音归一化必须是独立字段，而不是塞进正文索引。现行未做粤拼检索，站内检索文案也不提粤拼检索；英文与罗马字暂与汉字同走 `text_norm` 全文索引。字音数据源可用 rime-cantonese 与 lshk-org/jyutping-table（**待验证**：两者的许可与相互覆盖差异）。

### 6.3 查询管线

```text
用户输入（"nei5 hou2" / "唔係" / 单字）
  1. 归一：同字简转繁 + 去空白（不归并不同的字）
  2. （未实现）判定是否含罗马字（拉丁串或数字调）→ 切到 roman_norm 字段
  3. 汉字串与拉丁串 3 字及以上 → 整串短语 MATCH；1 至 2 字 → bigram / unigram 辅助表或 LIKE 降级
  4. FTS5 MATCH + bm25() 排序（现行只按 corpus 过滤；年代 / status 过滤未做）
  5. 返回 {id, corpus, issue, page, title, status, pre, highlight, post}（highlight 為命中處原文切片，前端以 <mark> 渲染）
     另返回 facets（逐语料命中篇数）与 total，见下
```

**已实测（本地 2026-10-02，生产 D1 2026-10-03）**：trigram 对 1 至 2 字查询返回 0 且不报错（无三元组可构造）；降级方案定为 bigram（2 字及以上）与 unigram（单字）辅助表，LIKE 全表扫描作兜底。见 `docs/spikes/0.1-d1-trigram.md`。

**接口响应（现行，`server/routes/search.ts` + `server/db/search.ts`）**：`GET /api/search?q=&corpus=&page=&page_size=` 返回 `{query, normalized, mode, page, page_size, total, facets, results, more}`。

| 字段 / 参数 | 规则 |
|---|---|
| `q` | 必填；归一后超过 100 字返回 400 |
| `corpus` | 可重复，空值忽略，最多取 20 个；检索页只传一个（单选） |
| `page` / `page_size` | `page` 为 1–500 的整数（默认 1）；`page_size` 为 1–50 的整数（默认 20，即 `RESULT_LIMIT`）；非法值返回 400。检索页每次取 40 条 |
| `results[]` | `{id, corpus, issue, page, title, status, pre, highlight, post}`，bm25 排序，`LIMIT/OFFSET` 分页；`status` 为该篇上游状态（`draft` / `verified` / `needs_review`），检索页据此画状态圆点；`pre` / `post` 为命中前后各约 60 字上下文（`SNIPPET_RADIUS`），找不到命中点（如只有标题命中）时退化为原文开头一段且 `highlight` 为 `null` |
| `facets` | `{<corpus slug>: 命中篇数}`：对同一 `MATCH` 条件另跑一条 `SELECT a.corpus, COUNT(*) … GROUP BY a.corpus`，**不加 corpus 过滤**，所以切换语料筛选时各语料计数不变；无命中的语料不列 |
| `total` | 由 `facets` 推出，不另跑 `COUNT`：无 corpus 过滤时为各语料之和，有过滤时为所选语料之和 |
| `more` | `page × page_size < total` |

命中页查询与 `GROUP BY` 计数并发执行（FTS5 的 `bm25()` 不能与窗口函数同用，故计数独立查一次）；空查询（归一后为空）直接返回空结果与空 `facets`。成功响应 `Cache-Control: public, max-age=60`，错误响应 `no-store`。

## 7. 影像与 IIIF

**影像开放政策**：本站只公开 OCR 文本；扫描影像涉及藏馆权益，预设不入库、不公开、不进 Git；仅在完成逐件核查（IA 条款、藏馆声明）后，个别语料可开放影像，届时才启用瓦片与 IIIF；书本类派生单页图同理顺延。

| 存储 | 价格要点 | 判断 |
|---|---|---|
| R2 | $0.015/GB-月，免费 10GB，出网免费（Class A 前 1M / Class B 前 10M 免费） | 采用；10GB ≈ 1–3 万页 |
| Vercel Blob | 出网 $0.05/GB，Hobby 禁商用 | 不推荐 |
| Git LFS | 按存储与带宽计费，克隆体验差 | 不可作影像主库 |

IIIF 值得采用，但第一版用静态形态：构建期预生成瓦片 / DZI + 静态 Manifest + OpenSeadragon。Mirador 重且大图慢，不采用。动态升级路径为 mkpoli/iiif-worker（Workers + R2 实现 IIIF Image API 3.0）；届时 region/size 由 Worker 现裁，静态瓦片退为缓存层。

已知影像限制：

- 报纸扫描仅约 968×1452px，深缩放体验有限 → 阅读器限制最大放大倍率并在 UI 明示。
- 书本类 `source_image` 指向整本 PDF，没有单页影像 → 本站自行渲染派生单页。**待决策**：构建期渲染成图片放 R2，还是阅读器内嵌 PDF 并跳页码锚点。

（对应 03 的坑清单 ⑦⑧。）

## 8. 多端与排版

| 关注点 | 方案 |
|---|---|
| 竖排 | `writing-mode: vertical-rl`；默认竖排（右起），可切横排，偏好存本机；汉字不多于拉丁字母的篇章（`isCjkDominant` 为假）一律横排（见 04 §1.1 M4、§3） |
| 粤拼注音 | HTML `<ruby>`，竖排时自动置于字符右侧；不要用绝对定位模拟 |
| 拉丁 / 数字 | 竖排下默认旋转 90°；需要保持横排的组合（如年份）用 `text-combine-upright` |
| 字体 | 必须子集化 + `unicode-range` 分片；整字体加载会拖死首屏 |
| 正文 | 必须在 DOM（可选中 / 复制 / 朗读 / 被索引），不用 canvas 画正文 |
| 影像 | AVIF/WebP + `srcset` + 懒加载 + 预取下一页 |
| SEO | 每页可索引 URL + sitemap + schema.org Book |

字体策略（现行，2026-10-06）：全部字体经 Google Fonts 加载，不自托管；正文与 UI 共用同一套字体栈（栈与用途见 docs/04 §4.3）。

| 项 | 现行做法 |
|---|---|
| 字体 | Noto Serif HK（全站中文，请求字重 400–700）、Jost（拉丁字母与数字，300–700），一条 css2 请求：`family=Noto+Serif+HK:wght@400..700&family=Jost:wght@300..700&display=swap` |
| 切片 | Google Fonts 已把 CJK 字体按 `unicode-range` 切成细片，浏览器只按页面实际用到的字下载对应切片 |
| 加载 | `src/layouts/Base.astro`：对 `fonts.googleapis.com` / `fonts.gstatic.com` 预连接（`preconnect`）；样式表以 `media="print"` + `onload` 切回 `all` 的方式非阻塞加载，附 `<noscript>` 回退 |
| 回退 | `src/styles/global.css` 的字体栈：`--serif` 为 Noto Serif HK → Noto Serif TC → serif；`--latin` 为 Jost → Noto Serif HK → sans-serif；连不到 Google 时落到系统字体 |

- 取舍：CJK 切片按字向 Google 即时取，本站不控制缓存与可用性；连不到 Google Fonts 的读者（如中国大陆）页面照常渲染，但只见系统字体。
- 不按语料现算子集（docs/04 D5）：Google Fonts 切片已能按需取字，免去每个语料一份子集的构建与缓存成本。
- 授权：Noto Serif HK 与 Jost 均以 SIL Open Font License 在 Google Fonts 发布。
- **待验证**：Noto Serif HK 对扩展区生僻字的覆盖；缺字时回落到系统字体，见 §10 第 5 项。

## 9. 仓库布局

三仓分离，照 Kanripo 先例：

| 仓库 | 内容 | 许可 |
|---|---|---|
| Jyutman | 站点代码与模板 | MIT |
| Jyutman-Corpus | OCR 文本 JSONL + 元数据 + 索引构建脚本 | CC BY-SA 4.0 |
| Jyutman-Images | 只放 manifest：object key / 尺寸 / checksum / 来源 / 许可 / 页码映射 | 待决策 |

影像本体在 R2，不进 Git。语料快照定期推 Zenodo 拿 DOI。不用 git-annex。

Jyutman 仓库目录结构建议（Astro 约定，`src/` 等价于 Nuxt 的 `app/`）：

```text
Jyutman/
├─ astro.config.mjs
├─ wrangler.jsonc            # Workers + Static Assets + D1/R2 绑定
├─ package.json
├─ src/                      # 页面与前端
│  ├─ pages/                 # 路由：/、/browse/[corpus]、/read/[corpus]/[issue]/[page]、/search、/about、/data
│  ├─ layouts/
│  ├─ components/            # 纯展示组件（服务端渲染，无客户端 JS）
│  └─ islands/               # 客户端交互岛：Viewer / SearchBox / CorrectionForm
├─ server/                   # Workers API（Hono）
│  ├─ routes/                # /api/search、/api/correct、/api/iiif/*
│  ├─ search/                # 归一化、trigram 查询构造、排序
│  ├─ db/                    # D1 访问与 SQL
│  └─ index.ts               # Worker 入口（Static Assets + API 合并）
├─ migrations/               # D1 迁移：建表、FTS5 虚拟表、corrections
├─ scripts/                  # sync-corpus / normalize / build-fts / gen-tiles / subset-fonts
├─ types/                    # 与 03 数据契约对齐的 Zod schema 与 TS 类型
├─ tests/                    # node:test（零依赖惯例）
├─ docs/                     # 本目录
└─ data/                     # 构建期临时产物（.gitignore）；权威副本在 Jyutman-Corpus
```

`types/` 中的 Zod schema 是数据形状的单一事实源：schema 变更必须同步更新 `docs/03-data-contract.md`。

## 10. 动工前必须实测清单

| # | 待验证项 | 方法 | 失败退路 |
|---|---|---|---|
| 1 | D1 是否启用 FTS5 trigram tokenizer（官方只确认支持 FTS5，tokenizer 选项未逐一确认）；已通过（本地 + 生产 D1 复核，`docs/spikes/0.1-d1-trigram.md`） | 实跑 `CREATE VIRTUAL TABLE t USING fts5(x, tokenize='trigram')` | 退回 unicode61 + 应用层自建 n-gram 列（普通表存三元组） |
| 2 | Pagefind 在真实古籍语料上的召回；已实测：不宜承担正文检索，仅作标题与罗马字辅助（`docs/spikes/0.2-pagefind.md`） | 从 gdvp 抽 20–50 篇构造查询集，人工判召回 | 站内即时搜索降级为「只搜标题」 |
| 3 | 静态文件数测算 | 按「按卷/章合并出页」估算文件数 vs 免费 2 万上限 | 升付费档，或页级内容改为客户端按 JSON 渲染 |
| 4 | 历史拼式 → 粤拼映射工作量 | 抽样传教士罗马字，人工标注映射覆盖率 | 第一版只做罗马字归一（去变音符 / 统一调号），不做严格粤拼对齐 |
| 5 | 生僻字字形来源 | 统计语料字符集，核对候选字体的覆盖与授权 | 扩大回退字体链；必要时按语料现算子集 |
| 6 | trigram 下的短查询（1–2 字）；已实测：bigram/unigram 辅助表方案可行（`docs/spikes/0.1-d1-trigram.md`） | 见 §6.3 降级方案 | unigram/bigram 辅助表，或 LIKE + 结果缓存 |

## 11. 演进路径

| 阶段 | 交付 |
|---|---|
| 第一版 | 3 个已发布语料（`gd-vernacular-paper` / `canton-vernacular-handbook` / `readings-in-cantonese-colloquial`，ID 前缀 gdvp / cvh / rcc）上线；纯文本阅读＋D1 检索＋校对提交（不含影像） |
| 第二版 | iiif-worker 动态裁切；更多语料；短查询优化 |
| 第三版 | 审阅员分级权限与任务流（3a 阶段审阅登录已由 Cloudflare Access 承载）、Workers AI 辅助校对（人工确认后才回写） |

## 12. 相关文档

- `docs/03-data-contract.md`：上游数据契约、字段语义、已知坑清单
- `docs/05-deployment.md`：平台选择、CI/CD、成本与监控
