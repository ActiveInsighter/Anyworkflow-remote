# 网页抓取

保存要关注的页面，手动或按频率抓取，结果存进 `aw_crawled_contents`。和[网页采集](page-capture.md)不同，抓取不经过用户的浏览器：调度器把到期的页面分批派发到公开仓库 [webpage-parser-action](https://github.com/ActiveInsighter/webpage-parser-action) 的 GitHub Actions，只能读到匿名可见的内容。

| 部分 | 位置 |
| --- | --- |
| 页面 | `src/pages/web-crawl-page.tsx`、`src/features/web-crawl/` |
| API | `src/lib/api/web-crawl.ts`，类型在 `src/types/web-crawl.ts` |
| 任务状态 | `webCrawlKind`（`@/lib/tasks`），每次抓取（run）进入顶栏任务中心 |
| 后端 | AnyWorkflow-workers 的 `pocketbase/pb_hooks/aw_crawl.pb.js`、`crawl.js`、`crawl_validation.js`，迁移 `1794120000_web_crawl.js` |
| 调度 | AnyWorkflow-workers scheduler 的 `crawl-schedule` 和 `crawl` job（`src/domains/crawl/`） |
| 抓取器 | webpage-parser-action 的 `crawl-run.yml`（`python -m webpage_parser run`） |

## 数据

- `aw_crawl_targets`：一个页面一条。链接、名称、页面类型（自动 / 普通网页 / X）、分类、抓取选项、频率（0 为仅手动，30 分钟到 7 天）、是否定时，以及最近一次的结果（时间、状态、错误码、条数、页面标题）。同一账号下链接唯一（不区分协议和域名大小写，忽略 `#` 片段），最多 200 个。
- `aw_crawl_runs`：一次抓取，最多 10 个页面。创建时快照页面设置（`items`），之后改设置不影响进行中的抓取；每个页面的结果写在 `results`。状态只由 PocketBase 路由推进，客户端只能创建、取消和删除已结束的记录。
- `aw_crawled_contents`：抓到的内容，按账号和内容身份（X 帖子 id 或页面链接）去重。`target` 和 `run` 指向来源；`contentHash` 不变时 `changedAt` 不动，界面据此标出「有更新」。删除页面或记录不会删除内容。

## 流程

1. **手动**：页面上选中若干页面点「抓取」，或添加时打开「立即抓取」。超过 10 个时拆成多次抓取；已经在抓取中的页面会被跳过（服务端也会拒绝）。
2. **定时**：scheduler 订阅 `aw_crawl_targets`，在最早的 `nextRunAt` 唤醒，每 60 秒兜底。到期页面按账号在一个事务里推进 `nextRunAt` 并创建定时抓取；错过的时段只补一次，不会积压。
3. **派发**：`crawl` job 把排队的抓取派发到 `crawl-run.yml`，输入只有记录 id。Action 用服务账号（`aw_crawler_services`）读取快照、抓取、逐页写内容并回报；scheduler 在 GitHub 运行结束后结算，没有回报的页面记为失败。
4. **取消**：排队中的立即取消；已派发的设置 `cancelRequested`，Action 在下一页前停止，scheduler 同时取消 GitHub 运行。

公开仓库的日志只出现记录 id 和计数，不出现链接和内容，也不上传 artifact。

## 页面行为

- 发起区：一行一个链接，最多 50 个；频率默认每天；分类可选已有的或新建。「抓取选项」折叠后仍然生效，数字角标显示设置了几项。X 主页链接自动改为抓取「页面上可见的公开帖子」。
- 列表三个视图（`?tab=`）：**页面**（勾选后批量抓取、暂停定时、删除）、**内容**（按分类和关键词筛选）、**记录**（每次抓取的状态、取消、逐页结果、GitHub 运行链接）。
- 点页面打开面板：该页面的内容、最近 10 次结果、设置。设置只提交改动的字段，未改频率时下次抓取时间不变。
- 轮询：有进行中的抓取时 4 秒一次，否则 30 秒（页面）或 60 秒（内容、记录）。抓取结束时内容和记录随之刷新。

## 安全

抓到的内容按不可信数据处理，和网页采集一致：正文作为文本或经过 `markdown-blocks` 的块渲染，不加载其中的图片；媒体只显示为链接；所有链接经过 `safeHref`。列表只读取 `content:excerpt(160,true)` 摘要，打开时才读取完整记录。

## 上线顺序

1. 部署 PocketBase 迁移和三个 hook；创建 `aw_crawler_services` 账号，并把它的 token 设为 webpage-parser-action 的 `WEBPAGE_POCKETBASE_TOKEN`。
2. 把 `crawl-run.yml` 合并到 webpage-parser-action 默认分支（`workflow_dispatch` 只认默认分支上的 workflow）。
3. 在 scheduler 设置 `CRAWL_GITHUB_TOKEN` 并重建镜像；未设置时两个 crawl job 不启动，日志会有 `crawl_disabled`。
4. 合并 Remote，自动部署。
