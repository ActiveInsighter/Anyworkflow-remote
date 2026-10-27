# 架构与异步任务框架

AnyWorkflow 由四个部分组成，PocketBase 是它们之间唯一的数据契约：

| 部分 | 仓库 | 职责 |
| --- | --- | --- |
| Web 控制台 | Anyworkflow-remote `src/` | 编辑 Run、查看执行、文件转换、资料库、设置 |
| 边缘 API | Anyworkflow-remote `worker/` | 同源 `/api/*`：上传、下载、资料库、唤醒转换调度器 |
| 转换调度器 | Anyworkflow-remote `converter-worker/` | Cloudflare Durable Object，驱动外部执行的异步任务 |
| 后端服务 | AnyWorkflow-workers | PocketBase hooks/migrations、Run 编排与派发、对话导出 |

浏览器扩展（AnyWorkflow）领取 Event 执行；file-converter-ai 在 GitHub Actions 中执行 PDF 转换。

## 解耦原则

- 前端只通过 `src/lib/api/` 访问 PocketBase 和边缘 API，不知道任务由谁执行。
- 后端处理器只读写 PocketBase 记录，不调用前端；Remote 只向调度器发送“唤醒”信号，不传参数。
- 任务语义（状态、生命周期、取消方式、进度）定义一次，前后端共用（见下文），不再各自比较状态字符串。
- 边缘 API 路由集中在 `worker/index.ts` 的路由表中（`worker/router.ts`），每个路径声明方法、处理函数和是否需要会话。

## 异步任务框架

文件转换、Run 对话导出和 Run 队列都是异步任务。框架源码在
`AnyWorkflow-workers/src/platform/tasks/`（平台无关，可在 Node、Cloudflare 和浏览器运行），
通过 `scripts/sync-task-kit.mjs` 原样复制到本仓库 `shared/task-kit/`，`npm test` 校验校验和。
**不要直接修改 `shared/task-kit/`**：在 workers 仓库修改后同步。

```text
shared/task-kit/
├── lifecycle.mjs              标准状态：idle / queued / running / succeeded / partial / failed / canceled / expired
├── catalog.mjs                任务类型目录：file-conversion、run-export、run（集合名 + 状态映射）
├── engine.mjs                 一轮处理：先推进运行中，再在并发槽位内启动排队任务；单任务出错隔离
├── retry.mjs                  指数退避、原地计数失败（可声明不能盲目失败的状态）
├── executors/github-actions.mjs  GitHub Actions 执行器：派发意图先落库、按 request id 对账、不重复派发
└── kinds/file-conversion.mjs  文件转换引擎（输入白名单 + 执行器 + 错误策略）
```

各任务保留自己的 PocketBase 状态值（兼容已有数据和小程序），由类型把状态映射到标准状态。
`kind.describe(record)` 返回 `{ state, active, stopping, progress }`，调度器和界面都按它判断。

| 任务 | 处理位置 | 引擎用法 |
| --- | --- | --- |
| 文件转换 | `converter-worker`（DO alarm），Docker 回退服务 | 外部执行：轮询 GitHub Actions |
| 对话导出 | workers `export` 服务 | 内联执行：领取租约后一次完成 ZIP，过期租约重领 |
| Run 队列 | workers `scheduler` | 多级状态机（Run → Task → Event、扩展租约）留在领域内，共享生命周期契约与 job 触发框架 |

新增任务类型：

1. 在 workers `catalog.mjs` 定义集合与状态映射，必要时在 `kinds/` 组装引擎；运行 workers 测试。
2. 选择宿主：Node job（`createJob` + 触发器）或 `converter-worker/index.ts` 的 `createEngines`。
3. 在本仓库运行 `node scripts/sync-task-kit.mjs`。
4. 前端在 `src/features/tasks/lib/sources.ts` 增加一个 `TaskSource`（标题、详情、链接），
   任务中心、侧栏计数和完成提醒自动生效；状态文案在 `src/lib/tasks/status.ts`。

## 前端任务层

- `src/lib/tasks/`：共享类型、状态文案与色调（`taskStatusMeta`）、`notifyTasksChanged()` 事件。
  任何创建、取消、重跑任务的操作调用它（Run 的 `invalidateRuns` 已内置），任务中心立即刷新。
- `src/lib/api/task-feed.ts`：一个查询覆盖所有类型——进行中的记录和 24 小时内结束的记录。
- `src/features/tasks/`：`TaskCenterProvider`（自适应轮询：运行中 5 秒、排队 20 秒、空闲 60 秒，
  隐藏标签页暂停）、顶栏任务中心（桌面 Popover，手机底部 Modal）、`TaskStatusBadge`、`TaskProgress`。
  任务在两次轮询之间结束时弹出带“查看”的提示。
- `useAsyncData` 的 `pollMs` 可以是函数，按最新数据选择下一次间隔；转换记录和导出记录据此
  在有进行中任务时快速刷新，空闲时放慢。

## 界面框架

- 外壳：侧栏位于画布色上，页面是一块带圆角和细阴影的面板（`variant="inset"`）；顶栏只有面包屑与任务中心。
- 导航按“工作 / 资源 / 工具”分组，设置与账户在底部；进行中的 Run 与转换在对应项旁显示数量。
- 浮层：`components/ui/modal.tsx` 移植自 exam-docs（Base UI），手机为底部弹出、可下拉关闭，宽屏为悬浮面板，
  支持分栏（`ModalSplit`）和页面推入。较长的表单与面板优先使用 Modal；Radix Dialog/AlertDialog 已统一为同样的外观。
