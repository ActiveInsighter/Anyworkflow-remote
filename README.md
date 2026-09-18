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
