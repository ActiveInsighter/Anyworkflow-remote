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
- 桌面侧栏布局
- 手机侧边导航、顶部路径导航与触控优化
- 自动深色模式
- Web App manifest
- GitHub Actions 回归测试、类型检查与构建
- GitHub Actions 自动部署到 Cloudflare Workers Static Assets

## 后端兼容

后端协议保持与小程序一致：

- `aw_clients`
- `aw_dispatch_runs`
- `aw_dispatch_tasks`
- `aw_dispatch_events`

Run 控制仍使用 `requestedAction + commandVersion + 1`。Run DSL 仍写入 `planText`，云端继续负责 Task/Event 展开。
`@task` 交给浏览器扩展执行，保留 Run → Task → Event → Act → Message 数据层级。Codex 执行已移除，新计划会拒绝 `@Codex`，旧记录仍可查看。

## 前端结构

依赖方向自上而下，下层不得引用上层：

```text
src/
├── main.tsx              入口：初始化主题、挂载路由
├── app/                  应用壳：路由、Provider、侧栏/顶栏、面包屑、导航配置、错误边界
├── pages/                路由页面，只负责组合 feature，不写业务逻辑
├── features/<领域>/       业务模块：components/ hooks/ lib/
│   ├── runs/             工作流列表、Run 详情与 Task → Event → Act → Message 层级
│   ├── run-editor/       新建/编辑 Run：草稿、执行计划、运行配置、保存与运行
│   ├── editor/           CodeMirror DSL 编辑器、工具栏与命令
│   ├── library/          收藏、模板与目录
│   ├── schedules/        每天重复计划
│   ├── runtime-config/   浏览器运行配置字段与默认值
│   ├── file-converter/   PDF → Markdown 转换
│   └── settings/         连接、外观、快捷键
├── components/
│   ├── ui/               shadcn/ui 原语（唯一的基础组件来源）
│   ├── layout/ feedback/ data-display/ form/ navigation/   跨 feature 复用的组合组件
│   └── theme/            主题选项
├── hooks/                通用 Hook（异步数据、异步操作、时钟、断点）
├── lib/
│   ├── api/              PocketBase 客户端、会话与各集合读写（唯一的后端访问层）
│   ├── domain/           纯领域逻辑：状态文案、计划、调度、重复规则、资料库树
│   ├── workflow-dsl/     DSL 校验、元数据与编辑器上下文
│   └── platform/         浏览器能力：存储、剪贴板、主题、键盘、下载
├── types/                后端记录与共享类型
└── styles/
    ├── tokens/           设计 Token：color / typography / shape / layout / elevation / motion
    ├── theme.css         Token → Tailwind 工具类映射
    ├── base.css          元素基线
    └── editor.css        CodeMirror 第三方 DOM 样式
```

约定：

- 组件只使用语义工具类（`bg-card`、`text-muted-foreground`、`duration-fast`、`z-overlay` 等），
  不写颜色值、数字 z-index 或自定义时长；新增视觉值先加到 `styles/tokens/`。
- 菜单、浮层、对话框、抽屉、折叠、选择统一使用 `components/ui/` 中的 shadcn 原语
  （DropdownMenu、Popover、Dialog/AlertDialog、Sheet、Collapsible、NativeSelect）。
- feature 之间通过公开的组件或 Hook 引用；页面只做组合。组件与 Hook 保持在约 300 行以内，
  超出时按子组件、Hook、纯函数拆分；`lib/` 中单一职责的解析器或集合访问模块可略长。

## 本地开发

```bash
npm ci
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

回归测试可单独运行：

```bash
npm test
```

### 浏览器回归

浏览器用例位于 `scripts/*.browser.mjs`，全部使用隔离的模拟 PocketBase 接口，不访问生产数据。
Playwright 以精确版本固定在 devDependencies 中，浏览器版本随之确定：

```bash
npm run test:browser:install         # 首次或升级 Playwright 后安装对应的 Chromium
npm run test:browser                 # 自动启动 Vite 开发服务器并运行全部用例
npm run test:browser -- pdf editor   # 只运行指定用例
```

可设置 `TEST_BASE_URL` 检查预览或线上部署（此时不启动本地服务器），设置 `SCREENSHOT_DIR`
保存截图。单个用例也可在 `npm run dev` 运行时直接执行 `node scripts/<用例>.browser.mjs`。
升级 Playwright 时保持精确版本号，并重新执行 `npm run test:browser:install`，避免库与已安装浏览器版本不一致。

## Agent 工作方式

根目录 `AGENTS.md` 是本项目统一的 Agent 入口，本地 Git checkout 与云端 CI 源码产物都遵循同一套规则。

Agent 应先读取 `AGENTS.md`，再按任务只加载相关的 `.agents/skills/`，不需要预先逐文件遍历整个仓库。

- UI 任务优先从 `ui-style` 开始，再按需组合其他 UI Skill。
- 后端/API/Run/Task/Event/DSL 使用 `anyworkflow-contract`。
- 修复、重构、发布前验证使用 `frontend-quality-gate`。
- Cloudflare / GitHub Actions 使用 `cloudflare-workers-assets`。

本地 Agent 可以利用 Git 状态、diff 和历史；云端源码产物不包含 `.git/`，这是预期行为，不影响完整源码与 Skill 使用。

## CI 源码与 Skills 产物

`.github/workflows/ci.yml` 在回归测试、类型检查和构建全部成功后，会自动生成 Linux/Unix 友好的源码 ZIP，并上传到当前 GitHub Actions Run 的 Artifacts。

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

## 消息同步回归验证

Run 详情中的消息来自 `aw_messages` 的分页记录，不使用计划消息数生成占位项。
展开的执行记录每 5 秒刷新，终态 Run 也会继续接收延迟同步的历史；隐藏标签页暂停定时请求。
消息列表仅获取元数据，点击后按记录 ID 查询正文，详情打开期间同步最新回复。

`npm run preflight` 包含消息分页、稀疏序号、记录归属与详情查询回归测试。
浏览器回归：`npm run test:browser -- history-messages`，覆盖终态延迟入库、0→1→2 条消息、详情更新、分页、失败重试、键盘焦点和响应式布局。

## 编辑器操作

Event 队列中的消息块和轮询组支持 `}*N` 重复后缀，`N` 为 1–100 的整数，
例如 `{ 继续整理 }*50`。
需要配套更新 AnyWorkflow-workers 的编译器和浏览器扩展；旧版本仍会拒绝超过 30 次。

编辑器的变量按钮始终将声明插入光标所属 Task的头部，放在已有配置和变量
之后、所有 Event 之前。新变量使用未占用的合法名称，并选中名称供修改。
智能复制与智能删除使用相同规则：光标紧邻或选中结构括号时处理整块，否则处理当前行
或选中行。选择全文仍可复制完整工作流，消息块的重复后缀随块一起处理。

编辑器的结构扫描位于 `source-structure.ts`，无副作用的插入和范围规划位于
`editor-commands.ts`，CodeMirror 事务与剪贴板操作位于 `use-editor-commands.ts`。
新增操作应复用这些模块，不再单独扫描括号。工具栏修改各自保留独立撤销记录。
浏览器回归：`npm run test:browser -- editor queue-repeat`，覆盖编辑器操作，以及手机和桌面上
重复次数的有效值与越界提示。

## 编辑已结束的 Run

已结束的 Run 可直接进入编辑器。进入和修改只读取数据并缓存本地草稿；保存时创建
`edited_rerun` 草稿，运行时创建 `edited_rerun` 排队记录。原 Run 保持不变。
保存后继续编辑该草稿使用原记录，发布时不额外创建版本。完整重跑继续使用 `rerun`。
版本号由 PocketBase 分配，需配套部署 AnyWorkflow-workers 的操作语义版本规则。

浏览器回归：`npm run test:browser -- run-edit`。

## 首页搜索、默认名称与版本选择

- 首页按名称或完整 Run ID 在服务端搜索；搜索词和状态保存在 URL，切换条件会回到第一页。
- 状态分为全部、草稿、进行中、已完成、失败和取消；已完成只包含成功记录。
- 新建编辑器使用本地日期生成 `工作流 YYYY-MM-DD #001`。序号以已有同日名称和本浏览器的预留序号为基础递增；自定义名称保持不变。
- 默认名称按账号与后端地址隔离；同浏览器支持 Web Locks 时跨标签页串行预留。跨设备同时创建不提供数据库级唯一性保证，预留名称不会创建 Run 记录。
- 版本选择支持前后切换、名称/版本号搜索和跳转最新版本，不改变详情页 URL。

浏览器回归：`npm run test:browser -- dashboard`。

## 文件转换

侧边栏的 `文件转换` 页面（新路径 `/file-converter`，旧路径 `/pdf-to-md` 继续兼容）
支持公开 PDF / Google Drive 地址、任务名称、ZIP 和合并 Markdown 文件名、页码范围、
提示词及转换器高级参数。当前处理器为 `pdf_to_md`，后续转换器可以复用同一页面、配置
和任务模型。

转换配置保存在 PocketBase 的 `aw_file_conversion_configs`；提交任务时只发送配置 ID，
后端会把配置版本和参数快照写入 `aw_pdf_to_md_jobs`，避免排队期间修改配置影响任务。
任务历史每 5 秒刷新，支持分页、GitHub 运行详情和受保护 ZIP 下载。
源 PDF 不上传 PocketBase；文件库只保留最终 ZIP。

后端需先部署 AnyWorkflow-workers 中的配置 migration、`aw_pdf_to_md_jobs` 验证 hook、
独立 `pdf` 镜像。
任务通过 PocketBase realtime 唤醒转换 worker，GitHub 仍使用共享 Gemini 队列。

验证：`npm run preflight`，以及 `npm run test:browser -- pdf`。浏览器用例检查四种宽度、任务参数、状态和自定义 ZIP 下载。

## 远程运行配置

设置页可保存当前账号的回复超时、随机等待和延迟回收默认值，版本冲突会提示重新加载。
新 Run 从默认值取得完整快照，编辑器允许单独覆盖，Run 详情展示实际配置。已有 Run
不会随默认值改变；完整重跑和断点恢复继承原配置，编辑副本可以覆盖。历史无快照 Run
继续使用本地扩展参数。运行配置与计划一起保存本地草稿，并按账号和后端地址隔离。

需配套部署 AnyWorkflow-workers 的 runtime configuration migration/hooks、scheduler 和新版扩展。
验证：`npm run preflight`，以及 `npm run test:browser -- runtime-config`；覆盖四种宽度、配置冲突、草稿恢复竞态和单 Run 覆盖。

## 每天重复执行

Run 编辑器的“执行计划”增加“每天”：选择时间和固定 UTC 偏移时区（北京时间为
UTC+08:00），保存草稿不会启动，点击“启用重复”才提交首次执行并启用后续计划。
首次时间自动选择下一次每日时刻。修改执行方式可以退回单次定时、延时或立即执行。

侧边栏“重复计划”可查看下次执行、最近 Run 和跳过次数，支持暂停、恢复及删除。
每次执行使用发布时的 DSL 和运行配置快照，生成同家族下独立的重跑版本。
暂停/删除只阻止后续生成；已提交的 Run 可在详情中单独取消。修改计划内容时，
暂停旧计划并从源 Run 创建编辑副本，再启用新的每日计划。

后端每分钟扫描；前一次仍在排队/运行时跳过本次，超过 15 分钟的错过时刻不补跑。
恢复时从未来下次时刻开始，不积压补跑。时区使用固定偏移，不自动调整夏令时。
需部署 AnyWorkflow-workers 的 `1791300000_recurring_runs.js` 和匹配 hooks。
验证：`npm run preflight`；`npm run test:browser -- recurrence`。

## 模型、起始链接与界面绑定

默认运行配置和 Run 编辑器的运行配置按“模型选择界面”设置模型与思考程度。DOM 与可选模型相同的
页面共用一组：ChatGPT 主界面与图片界面，Claude 主界面与 Code 界面；ChatGPT Cloud 界面单独一组
（其选择器尚未适配，暂不能设置）。可选项来自 `src/features/runtime-config/lib/model-catalog.ts`
（按各页面实测），思考程度随所选模型联动，换成不支持当前思考程度的模型会自动清空；留空保持页面当前选择。
站点改版后请更新该列表。配置按 Run 固定，已有 Run 不受账号默认值修改影响。扩展每次发送前按当前页面读取并核验实际
选择，不可用或未生效时阻止发送。

“默认起始链接”（`src/lib/domain/start-links.ts` 列出常用页面）用于 Task 的 `@let start_url=` 留空时：
编辑器只给出警告，后端编译 Run 时填入该链接（默认 `https://chatgpt.com/`）。编辑器里点击 `start_url=`
之后会弹出常用链接。`@var` 仍可用，`@let` 是推荐写法。

配置版本只取表达所需的最低值：无覆盖为 v1；ChatGPT/Claude 模型覆盖为 v2；Cloud 界面模型或非默认起始链接
为 v3。需先部署 AnyWorkflow-workers 的 migration/hooks 与新版 scheduler，再加载支持能力版本 3 的扩展，
最后发布 Remote。前端必须识别 v1–v3，否则遇到新版本的 Run 时列表会整页加载失败。
