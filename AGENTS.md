# AGENTS.md

本文件面向在本仓库工作的 AI 编码代理；人类贡献者请先看 [README.md](README.md) 与 [docs/](docs/) 下的规划文档。

## 项目现状

仓库已发布 Phase 1 首个上线版本（2026-10-03）：数据同步层、书目库、叶级阅读器（689 叶静态生成）与 D1 检索（Worker `/api/search`）已上线 `jyutman.com`。权威信息分布：

| 文件 | 内容 |
|---|---|
| [README.md](README.md) | 项目简介、语料一览、授权（粤文繁体，面向公众） |
| [docs/01-vision-and-scope.md](docs/01-vision-and-scope.md) | 愿景、目标/非目标、边界与契约、质量基线、风险 |
| [docs/02-technical-architecture.md](docs/02-technical-architecture.md) | 技术架构、检索设计、动工前实测清单 |
| [docs/03-data-contract.md](docs/03-data-contract.md) | 上游数据契约、字段语义、已知坑、版权登记 |
| [docs/04-features-and-ui.md](docs/04-features-and-ui.md) | 功能清单、URL 结构、阅读器、视觉与断点 |
| [docs/05-deployment.md](docs/05-deployment.md) | Cloudflare 部署、CI/CD、成本 |
| [docs/06-roadmap.md](docs/06-roadmap.md) | 分阶段路线图、当前状态 |

## 协作约定（必须遵守）

| 约定 | 内容 |
|---|---|
| 执行与复核分离 | 凡执行类工作由子代理（默认模型）完成，主代理负责复核 |
| 单一事实源 | 文档与实现必须一致；发现脱节，以代码为准并立即回改文档 |
| 范围变更 | 任何目标、非目标或数据契约变更，先改对应 docs 文档再落代码 |
| 数据边界 | 站点只读上游发布层 jsonl；绝不回写、绝不消费 work/ 层 |

## 文档纪律

- README 用粤文繁体（面向读者）；docs/ 用简体中文（面向贡献者与代理）；本文件面向代理。
- 修改 docs 文件时同步更新开头的状态引用块日期。
- 不编造数字与链接；未实测的内容标「待决策 / 待验证」。

## 常用命令

| 命令 | 用途 |
|---|---|
| `npm install` | 安装依赖（首次与依赖变更后） |
| `npm run dev` | 启动本地开发服务器 |
| `npm run build` | 生产构建，产物在 `dist/` |
| `npm run preview` | 预览生产构建产物 |
| `npm run sync` | 从上游 `JyutmanDataPipeline/data/` 重建站点数据层与 `db/import.sql`（派生数据，已提交 git，CI 不需要跑；`db/import.sql` 已于 2026-10-03 灌入生产 D1） |
| `npx wrangler deploy` | 部署 Worker 与静态资产到 `jyutman.com`（需 wrangler OAuth 登录，配置见 `wrangler.jsonc`） |
| `npx wrangler d1 execute jyutman --remote --file db/import.sql` | 重建生产 D1 数据（单条语句控制在 32 KB 以内） |
| `npm test` | 单元测试（`node --test`，测试在 `tests/`） |
| `npm run lint` | ESLint（9 flat config，配置在 `eslint.config.js`） |
| `npm run typecheck` | 类型检查（`astro check`） |

CI 已配置：`.github/workflows/ci.yml` 在 push 与 PR 时依次执行 `npm ci`、`npm test`、`npm run lint`、`npm run typecheck`、`npm run build`（Node 24）。

目录结构：`src/pages/` 页面路由；`src/layouts/` 与 `src/components/` 版式与组件；`src/styles/global.css` 全站样式；`src/utils/` 纯函数与数据层读取（检索管线在 `src/utils/search-planner.ts`，主機策略在 `src/utils/host-policy.ts`，索引端与查询端共用）；`src/data/generated/` 由 `npm run sync` 生成的派生数据（已提交 git，勿手改）；`scripts/` 数据同步脚本；`server/` Worker API（Hono 入口、主機策略分派、`/api/search` 路由与 D1 查询、限流）；`wrangler.jsonc` Worker、静态资产（`run_worker_first` 为 `true`，全量请求经 Worker）与 D1 绑定配置；`db/import.sql` 生产 D1 建表与灌数 SQL（已于 2026-10-03 执行）；`tests/` 测试与 fixture；`.github/workflows/` CI。

测试约定：纯函数放 `src/utils/`，测试放 `tests/*.test.mjs`（`node:test` + `node:assert/strict`，零额外依赖；Node 24 原生支持测试直接导入 `.ts`）。新增函数须配断言测试。

提交规范：使用约定式提交前缀（`feat:` / `fix:` / `docs:` / `chore:` 等）。
