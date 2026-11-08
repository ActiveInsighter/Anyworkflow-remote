# 网页采集

一个页面（`/crawl`）管理两种抓取：**云端**在 GitHub Actions 里匿名打开页面，免费，适合公开页面；**浏览器**在你自己一直开着的浏览器里打开，复用它已登录的账号，适合社交媒体。两端由同一个项目 [webpage-parser-action](https://github.com/ActiveInsighter/webpage-parser-action)（AnyWorkflow Crawler）执行，共用解析代码，结果写进同一个内容库。旧地址 `/page-capture` 和 `/web-crawl` 会跳转到这里。

| 部分 | 位置 |
| --- | --- |
| 页面 | `src/pages/crawl-page.tsx`、`src/features/crawl/` |
| API | `src/lib/api/crawl.ts`，类型在 `src/types/crawl.ts` |
| 任务状态 | `crawlJobKind`（`@/lib/tasks`），每个任务进入顶栏任务中心 |
| 后端 | AnyWorkflow-workers 的 `pocketbase/pb_hooks/aw_crawl.pb.js`、`crawl.js`、`crawl_validation.js`，迁移 `1794200000_unified_crawl.js` |
| 调度 | AnyWorkflow-workers scheduler 的 `crawl-maintenance`（定时、租约回收）和 `crawl-dispatch`（派发云端 workflow） |
| 执行 | webpage-parser-action：`crawl.yml`（云端）和 `dist/extension`（浏览器扩展） |

## 数据

- `aw_crawl_jobs`：一次抓取一个链接。直接提交链接时带自己的执行位置、分类和选项；抓取保存的页面时只写 `target`，服务端复制页面当前的设置。状态 `queued → opening → rendering → extracting → uploading → succeeded | partial | failed | canceled`，只由 `/api/anyworkflow/crawl/*` 推进；客户端只能创建、取消和删除已结束的记录。
- `aw_crawl_targets`：保存的页面。链接、名称、执行位置、分类、选项、频率（0 为仅手动，30 分钟到 7 天）、是否定时，以及最近一次的结果（任务、状态、错误码、文档、标题）。同一账号下链接唯一，最多 500 个。
- `aw_crawl_documents`：抓到的内容，按「账号 + 内容身份」去重（X 帖子是 `x:status:<id>`，其他是规范链接）。保存 Markdown、可选 HTML、条目（`items`，如帖子）、链接、图片和元数据。内容哈希变化时才更新 `changedAt`，任务上的 `changed` 记录那一次有没有变化。删除页面或任务不会删除内容。
- `aw_crawl_workers`：在线的浏览器扩展；`lastSeenAt` 在 3 分钟内算在线。

## 页面行为

- **发起区**：一行一个链接，最多 50 个。选择「云端 / 浏览器」，选中浏览器而扩展不在线时直接提示。粘贴知乎、微博等通常要登录的站点时，云端模式下会建议改用浏览器。打开「保存为页面」并选频率，链接会存进页面列表并立即抓取一次；否则只抓一次。「采集选项」折叠后仍生效，角标显示设置了几项；「云端读取方式」只在云端显示，「读取范围」只在 X 链接时显示。X 主页链接自动改为读取页面上的帖子。
- **三个视图**（`?tab=`）：**抓取**（默认，全部任务：查看内容、取消、重新抓取；云端因登录、拒绝或验证失败的任务可一键「用浏览器抓取」）、**页面**（勾选后批量抓取、暂停定时、删除）、**内容**（按分类和关键词筛选）。提交后自动切到结果所在的视图。
- **页面面板**：该页面的内容、抓取记录和设置。设置只提交改动的字段，未改频率时下次抓取时间不变；改执行位置或链接时会一并重发选项，让服务端按新的执行位置检查。
- **内容面板**：正文、条目（帖子：作者、时间、正文、互动数、原帖链接）、Markdown 源码、信息（执行位置、读取方式、质量分、警告等）、链接；可复制或下载带来源信息的 Markdown。
- **轮询**：有进行中的任务时 3 秒一次，否则 30 秒；扩展状态 30 秒。任务结束时页面、记录和内容随之刷新。

## 安全

抓到的内容按不可信数据处理：正文作为文本或经过 `markdown-blocks` 的块渲染，不渲染 HTML，不加载其中的图片；图片和媒体只显示为链接；所有链接经过 `safeHref`。列表只读取 `markdown:excerpt(160,true)` 摘要，打开时才读取完整记录。浏览器任务会在已登录的浏览器里打开，所以服务端和扩展都会拒绝本机、内网和屏蔽域名的链接，选项只接受选择器和数字。

## 验证

```bash
node --experimental-strip-types scripts/crawl-api.test.mjs   # API 载荷、选项规则、显示文案
npm run test:browser -- crawl task-center                    # 页面交互、不可信内容、320–1440px 和两种主题
```
