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
- Run → Task → Event 层级详情与运行时状态展示
- Event 执行内容按需查看
- 进行中数据自动轮询刷新与有界跨页缓存
- 收藏、模板与层级资料库目录
- CodeMirror DSL 编辑器、本地草稿与括号消息语法
- Run 级 `@Codex` 编排语法（与 `@task` 同级）
- 桌面侧栏布局
- 手机侧边导航、顶部路径导航与触控优化
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
其中 `@task` 交给浏览器扩展，`@Codex` 交给云端 Codex 执行器；两者仍共享 Run → Task → Event → Act → Message 的数据层级。

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

完整验证使用：

```bash
npm run preflight
```

静态产物位于 `dist/`。

## Agent 工作方式

根目录 `AGENTS.md` 是本项目统一的 Agent 入口，本地 Git checkout 与云端 CI 源码产物都遵循同一套规则。

Agent 应先读取 `AGENTS.md`，再按任务只加载相关的 `.agents/skills/`，不需要预先逐文件遍历整个仓库。

- UI 任务优先从 `ui-style` 开始，再按需组合其他 UI Skill。
- 后端/API/Run/Task/Event/DSL 使用 `anyworkflow-contract`。
- 修复、重构、发布前验证使用 `frontend-quality-gate`。
- Cloudflare / GitHub Actions 使用 `cloudflare-workers-assets`。

本地 Agent 可以利用 Git 状态、diff 和历史；云端源码产物不包含 `.git/`，这是预期行为，不影响完整源码与 Skill 使用。

## CI 源码与 Skills 产物

`.github/workflows/ci.yml` 在类型检查和构建全部成功后，会自动生成 Linux/Unix 友好的源码 ZIP，并上传到当前 GitHub Actions Run 的 Artifacts。

Artifact 名固定为：

```text
anyworkflow-remote-ai-context
```

Artifact 内包含：

```text
context.json
anyworkflow-remote-<commit-sha>.zip
```

其中：

- `context.json` 记录仓库、提交 SHA、Git ref、源码 ZIP 名称与 SHA-256、项目根目录、Agent 指南路径、Skills 根目录和默认验证命令。
- 源码 ZIP 由 `git archive` 直接从本次通过 CI 的 `HEAD` 生成，与成功构建的代码完全对应。
- ZIP 包含完整已跟踪源码、配置、`AGENTS.md`、`skills-lock.json` 与 `.agents/skills/`。
- ZIP 不包含 `.git/`、`node_modules/`、`dist/` 等 Git 元数据、依赖或生成目录。
- ZIP 内统一使用 Unix 风格路径，并带有 `Anyworkflow-remote/` 根目录。
- CI 会强制校验 `AGENTS.md`、`ui-style`、`skills-lock.json` 和 Skill 文件是否存在，避免生成不可用的 Agent 上下文包。
- Artifact 保留 30 天。

云端 Agent 推荐流程：

1. 找到最新成功的 `web-ci` Run。
2. 下载 `anyworkflow-remote-ai-context`。
3. 先读取 `context.json`，确认提交 SHA 和内层 ZIP。
4. 解压源码 ZIP。
5. 从 `Anyworkflow-remote/AGENTS.md` 开始工作，并按需加载 Skills。
6. 不要再通过连接器逐个读取已经存在于源码产物里的文件。

如果需要比当前产物更新的源码，应获取更新提交对应的成功 Artifact，不要混用不同提交的文件。

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

生产部署触发方式：

- 推送到 `main`：自动构建并部署
- GitHub Actions 页面：可手动运行 `workflow_dispatch`

预览部署工作流位于 `.github/workflows/deploy-preview.yml`。推送到 `codex/**` 或 `feat/**` 分支会更新共享预览 Worker，也可手动触发。

本地已登录 Wrangler 时也可执行：

```bash
npm run deploy
```

## Codex / Agent Skills

仓库内置项目级 Skills，位于 `.agents/skills/`：

- `anyworkflow-contract`：PocketBase / Run / Task / Event / DSL 契约
- `shadcn-responsive-ui`：shadcn/ui、响应式与可访问性
- `frontend-quality-gate`：登录、状态、类型检查与构建验证
- `cloudflare-workers-assets`：Workers Static Assets 部署规则
- `ui-style`：本项目 UI 总入口，统一项目 UI 约束并按需组合其他设计 Skill

另外随仓库保存的 UI 参考 Skills：

- `ui-ux-pro-max`：设计系统、可访问性、响应式与栈指南
- `frontend-design`：视觉层级、构图与差异化 Web 设计原则
- `tailwind-theme-builder`：Tailwind CSS 4 + shadcn/ui 主题与暗色模式指南
- `web-design-guidelines`：Web Interface Guidelines 审查规则

支持自动 Skill discovery 的 Agent 可以直接发现 `.agents/skills/*/SKILL.md`；其他 Agent 按 `AGENTS.md` 中的路由规则读取即可。

公开 Skill 的来源和版本哈希记录在根目录 `skills-lock.json`。其中 `tailwind-theme-builder` 的上游元数据标注为 `claude-code-only`，在本项目中作为 Tailwind/shadcn 参考规则保留。
