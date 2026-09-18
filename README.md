# AnyWorkflow Remote

AnyWorkflow 的响应式 Web 控制端。项目参考 `Anyworkflow-wechat` 的产品模型与 PocketBase 接口，但前端按桌面浏览器和手机浏览器重新设计，不复用小程序页面结构。

## 技术栈

- React 19.3
- Vite 8.3
- TypeScript 7
- React Router 8
- Tailwind CSS 4.3
- shadcn/ui（Radix primitives + Lucide icons + CSS variables）
- PocketBase HTTP API
- Cloudflare Workers Static Assets

## 已实现

- PocketBase 登录、退出与地址配置
- Run 列表与状态筛选
- Run 新建、草稿编辑、发布、复制、重跑、删除
- Run 暂停、继续、取消命令
- Run / Task / Event 详情
- Event 队列解析、复制和运行时状态展示
- 进行中数据自动轮询刷新
- 桌面侧栏布局
- 手机底部导航与触控优化
- 自动深色模式
- Web App manifest
- GitHub Actions 类型检查与构建
- GitHub Actions 自动部署到 Cloudflare Workers Static Assets

## 后端兼容

后端协议保持与小程序一致：

- `aw_clients`
- `aw_dispatch_runs`
- `aw_dispatch_tasks`
- `aw_dispatch_events`

Run 控制仍使用 `requestedAction + commandVersion + 1`。Run DSL 仍写入 `planText`，云端继续负责 Task/Event 展开。

## 本地开发

```bash
npm install
npm run dev
```

默认 PocketBase 地址为：

```text
https://pb.any1.tech
```

也可复制 `.env.example` 并设置：

```bash
VITE_POCKETBASE_URL=https://pb.any1.tech
```

## 构建

```bash
npm run typecheck
npm run build
```

静态产物位于 `dist/`。

## CI 源码与 Skills 产物

`.github/workflows/ci.yml` 在类型检查和构建全部成功后，会自动生成一个 Linux/Unix 友好的源码 ZIP，并上传到当前 GitHub Actions Run 的 Artifacts。

Artifact 名固定为：

```text
anyworkflow-remote-ai-context
```

其中包含单个源码包：

```text
anyworkflow-remote-<commit-sha>.zip
```

源码包由 `git archive` 直接从本次通过 CI 的 `HEAD` 生成，因此：

- 包含当前已跟踪的完整源码、配置、`AGENTS.md` 和 `.agents/skills/`
- 不包含 `.git/`、`node_modules/`、`dist/` 等运行时或构建目录
- ZIP 内统一使用 Unix 风格路径，并带有 `Anyworkflow-remote/` 根目录
- CI 会校验至少存在一个 `.agents/skills/*/SKILL.md`，避免 Skills 被意外漏包
- Artifact 保留 30 天

云端 Agent 可以先定位最新成功的 `web-ci` Run，再直接下载 `anyworkflow-remote-ai-context`，一次获得与该次测试构建完全对应的代码和 Skills。

## Cloudflare Workers Static Assets 部署

项目使用根目录 `wrangler.jsonc`，将 `dist/` 作为 Workers Static Assets，并启用 SPA fallback，因此 React Router 的深层链接可直接刷新。

GitHub 仓库需要以下 Actions Secrets：

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

其中 API Token 需要允许向目标 Cloudflare Account 部署 Workers。

部署工作流位于：

```text
.github/workflows/deploy-cloudflare.yml
```

触发方式：

- 推送到 `main`：自动构建并部署
- GitHub Actions 页面：可手动运行 `workflow_dispatch`

本地已登录 Wrangler 时也可执行：

```bash
npm run deploy
```

## Codex / Agent Skills

仓库内置项目级 Skills，位于 `.agents/skills/`，用于让 Codex 在后续修改时自动加载项目约束：

- `anyworkflow-contract`：PocketBase / Run / Task / Event / DSL 契约
- `shadcn-responsive-ui`：shadcn/ui、响应式与可访问性
- `frontend-quality-gate`：登录、状态、类型检查与构建验证
- `cloudflare-workers-assets`：Workers Static Assets 部署规则

Codex 会从仓库的 `.agents/skills/*/SKILL.md` 发现这些项目级 skills。

另外已加入以下通用 UI Skills，均随仓库保存：

- `ui-ux-pro-max`：UI/UX Pro Max 的设计系统、可访问性、响应式与栈指南
- `frontend-design`：Anthropic 的差异化 Web 视觉设计与文案原则
- `tailwind-theme-builder`：Tailwind CSS 4 + shadcn/ui 主题与暗色模式指南
- `web-design-guidelines`：Vercel Web Interface Guidelines 审查规则
- `ui-style`：面向本项目的 UI 风格聚合规则，统一以上指南与项目约束

公开 Skill 的来源和版本哈希记录在根目录 `skills-lock.json`。其中 `tailwind-theme-builder` 的上游元数据标注为 `claude-code-only`，在本项目中作为 Tailwind/shadcn 参考规则保留。
