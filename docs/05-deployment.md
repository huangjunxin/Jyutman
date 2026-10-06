> 状态：草案（2026-10-06）｜本文档随实现演进，以代码与单一事实源为准。

# 部署方案

站点组件与选型的依据见 `docs/02-technical-architecture.md`；同步流程消费的数据契约见 `docs/03-data-contract.md`。本文档只描述平台、CI/CD、成本与运维。

## 1. 平台选择：Cloudflare Workers + Static Assets

Astro 构建产物（`dist/`）作为 Static Assets 挂在同一个 Worker 上；所有请求先经 Worker 入口做主機策略（canonical 跳转、預覽域 noindex），再分派：`/api/*` 走 Hono 应用，其余交 Static Assets 直出（`assets.run_worker_first` 为 `true`，见 `wrangler.jsonc`）。

**不用 Cloudflare Pages 的理由**：

- 官方已推荐新项目使用 Workers + Static Assets，而非 Pages。
- 静态文件数上限：Pages 免费 2 万 / 付费 10 万。若「每页一个页面」，文件数会撞限（应对见 02 §3 与 §10：按卷/章合并出页 + 页级内容客户端渲染）。
- Workers 免费 10 万请求/日；单一 Worker 即可同时托管静态站点与 API，D1/R2 绑定更直接。
- 静态资产请求如何计入/是否计入 Workers 免费额度：**待验证**，以 Cloudflare 最新计费说明为准。

## 2. 部署拓扑

```text
GitHub 仓库 Jyutman
   ├─ Actions: CI（test / lint / typecheck / build）
   ├─ Cloudflare Workers Builds（Git 集成，正式部署通道）：
   │     push main   → 构建 + npx wrangler deploy → jyutman.com
   │     其他分支/PR → npx wrangler preview → 预览 URL（见 §3）
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
| production | push main | Cloudflare Workers Builds 自动构建并部署：构建命令 `npm ci && npm run build`，部署命令 `npx wrangler deploy` → jyutman.com |
| preview | 非 main 分支 / PR | Workers Previews：预览命令 `npx wrangler preview`（默认），预览名默认取分支名；URL 形态 `<preview-name>-jyutman.huangjunxin.workers.dev`（另有 `<deployment-id>-jyutman.huangjunxin.workers.dev` 固定版本 URL）。预览自带 `X-Robots-Tag: noindex`（workers.dev 域） |

**已定（2026-10-06）**：预览经 `wrangler.jsonc` 的 `previews.d1_databases` 绑**同一个生产 D1**（`7c4ba286-7a32-408f-920e-d55d0d0bc0d9`），让预览的 `/api/search` 可用；写路径风险可接受：`/api/correct` 公开但有 IP 令牌桶与蜜罐，`/api/queue`、`/api/adjudicate` 需 `ADMIN_TOKEN`，预览未设该 secret 时一律 401。实测：手动建一次预览（`npx wrangler preview --name config-check`）后 `/api/search?q=唔` 返回 `total 426`，预览页 200 且带 noindex，验证完已 `npx wrangler preview delete` 清理。

注意：预览**不继承**生产设置（bindings / vars / secrets 都要在 `previews` 块或 Previews Base 配置里显式给）；secrets 不入配置文件，需用 `npx wrangler preview secret put` 或 dashboard 的 Previews Base。

## 4. 域名与 URL

- 主域 `jyutman.com`（Cloudflare Registrar 注册）。已接入（2026-10-03）：apex 与 `*.jyutman.com` 由 Worker 路由服务，SSL 由 Cloudflare 自动下发；`workers.dev` 地址保留可访问。
- `www.jyutman.com` → apex 301 重定向：zone 内暂无 www DNS 记录（`www.jyutman.com` 查询为 NXDOMAIN），**未加任何 DNS**；Worker 的 canonical 规则已覆盖 www，记录一旦建成（proxied）即自动 301 到 apex。
- canonical-host 中间件：**已落地**（`server/index.ts` + `src/utils/host-policy.ts`）：Host 非 `jyutman.com` 且非 `*.workers.dev` 时 301 到 `https://jyutman.com` 同路径同查询串；本地 `localhost` / `127.0.0.1` 放行，方便开发。
- `*.workers.dev`（含版本预览域）所有响应加 `X-Robots-Tag: noindex`，避免被搜索引擎收录：**已落地**（静态资产与 API 响应同样生效）。
- 注意：跳转与 noindex 要覆盖静态资产，故 `assets.run_worker_first` 为 `true`，全部请求都计入 Workers 请求数（免费 10 万/日，当前规模远低于额度）。
- URL 结构（与 04 §2.2 一致）：`/`、`/browse/:corpus`、`/read/:corpus/:issue/:page`、`/search`；每页可索引 URL + sitemap + schema.org Book。

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

工作流已落地 `.github/workflows/ci.yml`（Node 24，`npm ci` / `npm test` / `npm run lint` / `npm run typecheck` / `npm run build`），首个 run 已通过。

**部署通道（2026-10-06 起）**：正式通道是 Cloudflare **Workers Builds**（Git 集成），不再依赖 GitHub Actions 部署 job：

| 项 | 值 |
|---|---|
| 连接 | Worker `jyutman` → Settings → Builds → Connect，仓库 `huangjunxin/Jyutman`，分支 `main`，根目录 `/` |
| 构建命令 | `npm ci && npm run build` |
| 部署命令 | `npx wrangler deploy`（默认；生产分支构建即上线） |
| 预览命令 | `npx wrangler preview`（默认；非生产分支构建出预览 URL，并回帖到 PR） |
| 依赖 | 仓库根有 `wrangler.jsonc`（name / main / assets / d1 / routes / workers_dev 齐备），Workers Builds 无需 autoconfig |

**状态（2026-10-06）**：连接分两步。

1. **一次性 GitHub App 授权（必须走浏览器）**：Workers & Pages → Worker `jyutman` → Settings → Builds → Connect → 选 GitHub 并授权 Cloudflare GitHub App（可只授权 `huangjunxin/Jyutman` 一个仓库）。Cloudflare 没有提供代劳这步的接口。
2. 授权之后可二选一：
   - **继续用 dashboard**：填上表各项（Branch control 里确认生产分支 `main`、勾选 **Enable Preview Builds**），Save 即可。
   - **改用 Workers Builds REST API**：需要**用户级** API token（权限 `Workers Builds Configuration: Edit`，另加 `Workers Scripts: Read`；**账号级 token 不支持**，会报 Invalid token）。流程：`GET /accounts/{account_id}/workers/scripts` 取 Worker `tag` → `PUT /accounts/{account_id}/builds/repos/connections`（`provider_type: github` + GitHub 用户 ID 与仓库 ID）→ `POST /accounts/{account_id}/builds/triggers` 建两条 trigger（生产 `branch_includes: ["main"]`；预览 `branch_includes: ["*"]`、`branch_excludes: ["main"]`、`deploy_command: "npx wrangler preview"`）→ `POST /accounts/{account_id}/builds/triggers/{uuid}/builds` 触发首次构建。参考：<https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/>

授权完成前，`npx wrangler deploy` 手动部署仍是有效通道，并永久保留为**应急回退**（构建/连接故障、需立即回滚时用）。

**当前差异（需留意）**：`main` 已含西关满洲窗重设计（PR #1，fa932f3），但生产站仍是 2026-10-03 手动部署的版本；连接 Workers Builds 后首次构建（或手动 `npx wrangler deploy`）才会更新线上内容。

**纪律（必须执行）**：push main 即触发自动构建并上线。**推 main 之前必须本地四连绿（`npm test` / `npm run lint` / `npm run typecheck` / `npm run build`）且 GitHub Actions CI 绿**；不确定就开分支走 PR 预览。

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
| `ADMIN_TOKEN` | 校对工作台鉴权（`/api/queue`、`/api/adjudicate`） | Worker secret（`npx wrangler secret put ADMIN_TOKEN`）；预览要用的話 `npx wrangler preview secret put` 或 dashboard Previews Base |
| Workers Builds API token | 构建时上传与部署 | Cloudflare 在首次连接时自动生成（用户级 token），无需人工管理 |
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` | 仅在需要 Actions 部署或数据同步时用 | 目前未写入 GitHub Secrets；本机部署走 wrangler OAuth |
| `TURNSTILE_SECRET_KEY` | 校对提交防滥用（**待决策**：是否启用 Turnstile） | 预留：GitHub Secrets + Worker secret |
| 本地开发变量 | `wrangler dev` 本地 D1 模拟所需 | `.dev.vars`（.gitignore，绝不进 Git） |

原则：密钥只存在于 Cloudflare secret 与 GitHub Secrets；任何 key 文件不进仓库。

## 9. 数据更新节奏

```text
上游管道跑完 → 发布 release（jsonl 快照）
  → 通知本站（手动触发或 repository_dispatch）
  → sync-data workflow：
       1. 下载并 Zod 校验 jsonl
       2. 归一化 + 构建 FTS5 索引 → D1
       3. 新影像 / 瓦片 → R2（ASCII object key）
       4. 写 sync_meta（源 release、行数、跳过行数、映射表版本）
  → 若静态页受影响（新语料 / 新期号）→ push main 触发 Workers Builds 自动重建部署
       （应急时改用本机 `npx wrangler deploy`；D1 数据更新目前仍由本机 `wrangler d1 execute` 完成，未自动化）
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
