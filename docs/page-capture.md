# 网页采集

输入链接，由浏览器扩展抓取页面内容。Remote 只负责提交和展示，真正打开页面的是用户自己的浏览器，所以能读到需要登录才能看到的内容。

| 部分 | 位置 |
| --- | --- |
| 页面 | `src/pages/page-capture-page.tsx`、`src/features/page-capture/` |
| API | `src/lib/api/page-capture.ts`，类型在 `src/types/page-capture.ts` |
| 任务状态 | `pageCaptureKind`（`@/lib/tasks`），和其他任务一样进入顶栏任务中心 |
| 后端 | AnyWorkflow-workers 的 `pocketbase/pb_hooks/aw_capture.pb.js`、`capture.js`、`capture_validation.js` |
| 扩展 | [Anyworkflow-capture](https://github.com/ActiveInsighter/Anyworkflow-capture) |

Remote 和后端的数据流、字段说明、错误码都在扩展仓库的 `docs/architecture.md`，这里不重复。

## 页面行为

- **提交**：一行一个链接，也可以直接粘贴多个，一次最多 50 个。重复链接自动合并，没写协议的补 `https://`。任何一行读不出来都不提交，并指出是哪一行。
- **逐条创建**：一批是多次独立的创建，某个链接被服务端拒绝时，其他链接照常提交，被拒绝的留在输入框里。记录 id 在客户端生成，响应丢失后重试不会重复排队。
- **轮询**：有进行中的任务时 3 秒一次，否则 30 秒一次。
- **扩展状态**：`aw_capture_workers.lastSeenAt` 在 2 分钟内算在线。有任务在排队而扩展离线时，列表上方会提示。
- **结果**：只在打开时读取 `aw_capture_results`，列表用 `aw_capture_jobs` 上的摘要字段。超过 20 万字符时只预览开头，下载始终是完整内容。下载的 Markdown 带 front matter（标题、来源、作者、站点、发布时间、采集时间）。

## 安全

采集到的内容是第三方页面的内容，按不可信数据处理：

- 正文始终作为文本显示，不解析成 HTML 或渲染 Markdown。
- 所有来自结果的链接都经过 `safeHref`，只有 http/https 才渲染为链接，`javascript:` 不会变成 `href`。

如果以后要渲染 Markdown 预览，必须先做净化，并为图片和链接单独处理。

## 上线顺序

1. 部署 PocketBase 迁移和三个 hook。集合不存在时页面会报错，所以这一步必须先做。
2. 合并 Remote，自动部署。
3. 在要执行采集的 Chrome 里加载扩展并登录。
