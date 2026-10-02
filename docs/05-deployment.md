> 状态：草案（2026-10-02）｜本文档随实现演进，以代码与单一事实源为准。

# 部署方案

站点组件与选型的依据见 `docs/02-technical-architecture.md`；同步流程消费的数据契约见 `docs/03-data-contract.md`。本文档只描述平台、CI/CD、成本与运维。

## 1. 平台选择：Cloudflare Workers + Static Assets

Astro 构建产物（`dist/`）作为 Static Assets 挂在同一个 Worker 上；API 由同一 Worker 的 Hono 应用处理（`/api/*` 走 Worker，其余走静态资产）。

**不用 Cloudflare Pages 的理由**：

- 官方已推荐新项目使用 Workers + Static Assets，而非 Pages。
- 静态文件数上限：Pages 免费 2 万 / 付费 10 万。若「每叶一页」，文件数会撞限（应对见 02 §3 与 §10：按卷/章合并出页 + 叶级内容客户端渲染）。
- Workers 免费 10 万请求/日；单一 Worker 即可同时托管静态站点与 API，D1/R2 绑定更直接。
- 静态资产请求如何计入/是否计入 Workers 免费额度：**待验证**，以 Cloudflare 最新计费说明为准。

## 2. 部署拓扑

```text
GitHub 仓库 jyutman
   ├─ Actions: CI（test / lint / typecheck）
   ├─ Actions: deploy（push main → wrangler deploy）
   └─ Actions: sync-data（corpus release → D1 + R2）
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
              D1（SQLite）                    R2（影像 / 瓦片）
                    └──────────────┬──────────────┘
                                   ▼
                    Worker（Static Assets + /api/*）
                                   ▼
                    jyutman.com（Cloudflare 边缘网络）
```

## 3. 环境

| 环境 | 触发 | 说明 |
|---|---|---|
| production | push main | jyutman.com |
| preview | PR | Workers 原生支持 preview 环境与 URL；每个 PR 一个预览地址 |

**待决策**：preview 连生产 D1/R2，还是连独立 staging 资源。倾向独立（避免预览写入污染生产 corrections），但成本与复杂度待评估。

## 4. 域名与 URL

- 主域 `jyutman.com`（Cloudflare Registrar 注册）。
- `www.jyutman.com` → apex 301 重定向。
- canonical-host 中间件：请求 Host 非规范域时 301 到规范域（参考同类 Cloudflare 站点的做法）；preview 环境与 `*.workers.dev` 一律加 `X-Robots-Tag: noindex`，避免被搜索引擎收录。
- URL 结构（与 04 §2.2 一致）：`/`、`/browse/:corpus`、`/read/:corpus/:issue/:page`、`/search`；每叶可索引 URL + sitemap + schema.org Book。

## 5. CI/CD

最小门禁（GitHub Actions）：

```yaml
# 概念示意，实际 workflow 文件以实现为准
on: [push, pull_request]
jobs:
  ci:
    steps:
      - npm test          # node:test，零依赖惯例
      - npm run lint      # ESLint flat config
      - npm run typecheck
  deploy:
    if: github.ref == 'refs/heads/main'
    needs: ci
    steps:
      - wrangler deploy   # Workers + Static Assets
```

数据同步为独立 workflow `sync-data.yml`，不随代码部署触发（见 §9）。

**流程教训（必须执行）**：同类站点早期无 CI、文档与实现脱节的教训。本仓库从第一天起：CI 门禁 + 文档与代码的单一事实源约定：02 / 03 / 本文档的描述若与代码冲突，以代码为准并立即回改文档。

## 6. 成本预算

| 项 | 免费额度 | 目标规模下的估算 |
|---|---|---|
| Workers | 免费 10 万请求/日 | API 请求量小（静态页不占 Workers 配额），$0；需要付费特性或撞限时 $5/月 |
| Static Assets | 免费 | 与 Worker 同档 |
| R2 | 免费 10GB 存储；出网免费；Class A 前 1M / Class B 前 10M 免费 | 起步 <10GB = $0；100GB 影像约 $1.35/月 |
| D1 | 免费 5GB / 500 万行读每日 | 文本仅几十 MB，$0 |
| 域名 | （无） | $10/年量级 |
| **合计** | | **$0–5/月 + 域名** |

数字为撰写时的公开报价，会变化；以 Cloudflare 最新价目为准。

## 7. 监控与告警

- **Workers observability**：`wrangler.jsonc` 的 `observability` 配置（日志与指标）。
- **R2 用量告警**：接近免费 10GB 阈值时提醒。
- **D1 读限额监控**：免费档 500 万行读/日。**待验证**：一次 FTS5 MATCH 查询计入多少行读，若按扫描行计，检索可能成为限额瓶颈；实测后决定是否加缓存层。
- **站点侧**：`/api/*` 的错误率与 P95 延迟（Workers 指标即可）；静态层由 Cloudflare 缓存兜底。

## 8. 环境变量与密钥

| 名称 | 用途 | 存放 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Actions 部署与数据同步 | GitHub Secrets |
| `CLOUDFLARE_ACCOUNT_ID` | 同上 | GitHub Secrets |
| `TURNSTILE_SECRET_KEY` | 校对提交防滥用（**待决策**：是否第一版启用 Turnstile） | GitHub Secrets + Worker secret |
| 本地开发变量 | `wrangler dev` 本地 D1/R2 模拟所需 | `.dev.vars`（.gitignore，绝不进 Git） |

原则：密钥只存在于 GitHub Secrets 与 Worker secrets；任何 key 文件不进仓库。

## 9. 数据更新节奏

```text
上游管道跑完 → 发布 release（jsonl 快照）
  → 通知本站（手动触发或 repository_dispatch）
  → sync-data workflow：
       1. 下载并 Zod 校验 jsonl
       2. 归一化 + 构建 FTS5 索引 → D1
       3. 新影像 / 瓦片 → R2（ASCII object key）
       4. 写 sync_meta（源 release、行数、跳过行数、映射表版本）
  → 若静态页受影响（新语料 / 新期号）→ 触发一次站点重建部署
```

**待决策**：D1 索引更新用全量重建 + 原子表切换（简单、可回滚、可预期），还是增量 upsert（省额度但复杂）。数据量小，倾向全量重建。

## 10. 备选部署路径

| 方案 | 定位 | 说明 |
|---|---|---|
| Docker 自托管 | 备选 / 离线镜像 | 采用自行维护的 `compose.yaml` 模式；需自带 SQLite（本地 FTS5）与影像静态目录。仅作备选，不作目标 |
| Vercel | 对照，不作目标 | Hobby 禁商用；影像出网 $0.05/GB（见 02 §7） |

## 11. 相关文档

- `docs/02-technical-architecture.md`：组件、检索设计与静态文件数测算
- `docs/03-data-contract.md`：同步脚本消费的字段、容错策略与坑清单
