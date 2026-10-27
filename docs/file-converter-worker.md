# 文件转换调度 Worker

代码在 `converter-worker/`，独立部署为 `anyworkflow-file-converter`，配置为
`wrangler.converter.jsonc`。PDF 识别仍由 `ActiveInsighter/file-converter-ai` 的
`pdf-to-md.yml` 执行；调度器固定发送 `ref: main`，不读取旧服务器的
`GITHUB_FILE_CONVERTER_REF`，也不接受客户端指定 ref。

## 职责与数据

浏览器继续使用 PocketBase 的 `aw_file_conversion_configs`、`aw_pdf_to_md_jobs`。
配置快照、系统提示词、本次提示词、页码范围、相邻页、模型、并发数等均沿用原接口。
Worker 从已保存的任务构建白名单 inputs，不接受浏览器直接提交 Actions 参数。
状态机来自共享异步任务框架（`shared/task-kit/`，源码在 AnyWorkflow-workers 的 `src/platform/tasks/`）：
`kinds/file-conversion.mjs` 定义输入白名单与引擎，`executors/github-actions.mjs` 负责派发、对账、取消和产物回存。
Cloudflare 调度器与 Docker 回退服务构建同一个引擎，行为不会分叉；Docker PDF 服务仅作为显式启用的回退路径。

浏览器保存新建、重跑或取消后，向同源 `POST /api/file-conversion/wake` 发送通知。
Remote Worker 使用固定 PocketBase 验证当前会话，再通过私有 `FILE_CONVERTER` service binding
唤醒调度器。调度器关闭 workers.dev、预览 URL，没有公网路由。
通知失败不撤销已保存任务，也不重复创建；每分钟 cron 补漏，因此 MCP 或直接写入 PocketBase
的任务也可以运行。生产与现有共享预览都使用同一 PocketBase，唤醒的是同一队列。

单个 SQLite Durable Object（`TaskCoordinator`，以原名 `ConversionCoordinator` 绑定以保留存储）协调共享模型配额池，最多同时运行一个转换。
新的外部执行任务类型只需在 `converter-worker/index.ts` 的 `createEngines` 中注册引擎。
活跃任务和等待任务分开读取，等待队列超过一页也不会阻塞当前 Actions 的状态同步。
只有 alarm 执行状态机；HTTP 与 cron 只设置 alarm。活跃时每 30 秒核对 Actions，
空闲时关闭 alarm。PocketBase 仍是任务唯一数据源，DO 仅持有 alarm 和最近一次检查摘要。
发送前先持久化 dispatch intent；请求结果不确定时按 request_id 对账，15 分钟未确认则报错，
绝不自动重复付费提交。取消和失败也会尽量保存已有 ZIP，保持 partial/canceled 下载行为。

ZIP 从 GitHub 签名存储地址流式上传回原 PocketBase 受保护 file 字段。
保留 100 MiB 上限，校验 Content-Length、实际长度和 ZIP 文件头；GitHub 凭据不发送给存储地址。
上传失败可由下轮检查重新下载同步，无需重复运行转换。日志记录 job id、run id、实际分支和 SHA，
不记录提示词、源文件链接或密钥。

## 浏览器下载

下载按钮只请求短期 PocketBase file token，随后交给浏览器下载管理器；网页不再
通过 fetch/blob 等待完整 ZIP。生产使用同源 `GET /api/file-conversion/download`，
Worker 将文件流直接转发，保留中文产物文件名及 Range/If-Range、HEAD、Content-Length。
PocketBase 在源端继续验证 file token 和归属；无服务器身份绕过授权，目标固定为配置中的
PocketBase 和转换产物集合。下载响应禁止缓存，鉴权错误不作为 ZIP 返回。
短期 token 到期后如需重新发起/恢复下载，应再次点击按钮取得新权限。
自定义 PocketBase 连接仍使用该服务自己的受保护附件下载接口。

2026-10-24 下载排查：任务 `cc1c013d2fe2487` 的 32,116,376 字节 ZIP 在服务器侧约
3.6 秒完整取回；源接口和 CORS 正常，Range 请求返回 206。旧网页先完整缓冲才保存，
慢速或中断时只会持续转圈并最终显示 Failed to fetch。新入口让浏览器显示实际下载进度，
传输过程中不锁定转换记录的其他操作。

## 首次切换

1. 运行 `npm run preflight`；`npm run test:browser -- pdf` 验证转换界面。
2. 给目标 Worker 配置 secrets：`POCKETBASE_SERVER_TOKEN`、`GITHUB_FILE_CONVERTER_TOKEN`。
   PocketBase 使用现有服务身份；GitHub 使用该仓库的 Actions 读写权限。
   密钥通过受保护的标准输入或临时 secrets 文件配置，不能提交或打印。
3. 先以 `CONVERTER_ENABLED=false` 部署，确认打包、绑定和 secrets，保持旧服务运行。
4. 确认当前没有 dispatch 正在提交；停止并禁用旧 `anyworkflow-pdf-1` 的自动重启。
   从服务器环境中删除旧 `GITHUB_FILE_CONVERTER_REF`，后续 Compose 不再启用 PDF profile。
5. 使用仓库配置部署调度器（`CONVERTER_ENABLED=true`），再部署 Remote。
   后续 `main` 推送通过 `deploy-cloudflare.yml` 先发布调度器，再发布 Remote。
   生产部署 workflow 拒绝非 main 分支。
6. 用一个单页任务验证 Actions 的 `head_branch=main`、实际 SHA 与当前 main 一致，
   等待状态回存并下载 ZIP。验证旧容器仍停止。不要重新提交历史未确认的 dispatch。

日常更新：`npm run converter:deploy`。暂停：
`npx wrangler deploy --config wrangler.converter.jsonc --var CONVERTER_ENABLED:false`。
查看日志：`npx wrangler tail anyworkflow-file-converter`。重新生成类型：`npm run converter:types`。
生产配置中的 `CONVERTER_ENABLED=true` 会在下一次正常部署恢复运行。

2026-10-24 生产验证：旧 PDF 容器已停止且 restart=no，旧 ref 已移除；
[运行 #138](https://github.com/ActiveInsighter/file-converter-ai/actions/runs/40095870626)
通过前端相同的 PocketBase 创建及 Worker 唤醒接口触发，使用 main 的
`cb12d91b37912d18c24bb4d8dfd02e26d73121fd`，单页 Actions 约 33 秒成功。
任务 `cfsmoke20261024` 回存为 succeeded，616 字节 ZIP 通过受保护下载接口取回，
包含合并 Markdown 及 pages/001.md，文本为 `Dummy PDF file`。

回退时先暂停 Cloudflare 调度器并等待当前检查结束，然后才启用 Docker 回退服务；
将 Docker 的 ref 明确设为 main，并显式设 `PDF_LEGACY_ENABLED=true`。禁止两套消费者同时运行。
PocketBase 记录、配置、产物和 Actions 本身不随代码回退删除。

实现依据：[DO alarms](https://developers.cloudflare.com/durable-objects/api/alarms/)、
[GitHub workflow dispatch](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event)。
