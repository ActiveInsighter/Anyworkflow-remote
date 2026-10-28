# PDF 上传中转

> 以下“一天后到期”描述的是旧生产策略。新归档实现需要先取消对象删除生命周期，
> 改为上传满一天后发布并验证 Assets，再删除原件。启用步骤和回退限制见 [PDF 归档](pdf-archive.md)。

文件转换页保留原有的链接输入，另提供可选的本机 PDF 上传。上传后生成普通 HTTPS `.pdf` 链接，
任务仍使用 `sourceUrl`；PocketBase、转换器和产物文件库的接口不变。

## 生产资源

- Cloudflare Account：`23770063c0a0150df7b1244a636048c8`
- R2：`anyworkflow-ocr-relay`，创建时使用 `apac` location hint
- 自定义域名：`https://ocr-files.any1.tech`，最低 TLS 1.2
- `r2.dev`：禁用
- 生命周期：`expire-pdfs-after-1-day`，全部对象一天后到期
- Remote Worker：`anyworkflow-remote`，通过 `PDF_UPLOADS` 绑定写入

上传最大 2 GiB，使用 32 MiB 分片、最多 3 片并行。每片独立重试，完成后生成原有格式的 PDF 链接。
仅接受 PDF 扩展名与 `%PDF-` 文件头；分片长度由 `FixedLengthStream` 原生校验，文件头从 `tee()` 分支读取前 5 字节，
合并后再用 R2 范围读取复核。不要在分片流上加逐块 JavaScript 转换：32 MiB 分片会消耗约 1 s CPU，
并发分片会触发 Worker CPU 限制（503）。对象 key 为随机 UUID，
不含原文件名或用户 ID，响应和对象设置 `Cache-Control: no-store`。公开链接无需认证，
持有链接者可以读取。一天后到期的删除由 R2 异步执行，不能作为精确的访问失效时间。

## 认证与部署

`POST /api/file-conversion/uploads/multipart` 创建上传，`PUT .../{uploadId}/parts/{partNumber}`
流式上传单片，`POST .../{uploadId}/complete` 合并文件，`DELETE .../{uploadId}` 取消未完成的上传。
每个请求都携带当前 PocketBase Bearer token；分片、完成和取消还须携带签名上传票据。
旧的 `PUT /api/file-conversion/uploads` 保留 90 MiB 单请求入口以兼容旧页面，当前页面均使用分片。
Worker 只向配置中的 `POCKETBASE_URL` 验证 `aw_clients` 会话，不将令牌转发到客户端指定的其他地址。
浏览器和转换仓库均不需要 R2 Access Key；现有 Cloudflare 部署身份配置 Worker binding。

部署时须为目标 Worker 设置 `UPLOAD_TICKET_SECRET`（至少 32 字符的随机服务端密钥），
用于绑定上传者、对象 key、大小、R2 upload ID 和票据时效。通过 `wrangler secret put`
或受保护的标准输入配置，不放入源码、浏览器或日志。生产和现有预览 Worker 已分别配置；部署其他 Worker
时需为它单独配置。未完成分片另有 `abort-incomplete-after-1-day` 规则，一天后自动清理。

## 转换器分段中转

`PUT /api/file-conversion/relay` 供转换器（GitHub Actions）上传 OCR 分段，复用单请求上传的校验与存储：
90 MiB 以内、`%PDF-` 文件头、随机 UUID key、一天后到期。认证使用服务端共享密钥
`RELAY_UPLOAD_SECRET`（Worker secret，至少 32 字符），转换仓库以 `PDF_RELAY_TOKEN` secret 持有同一值；
未配置该 secret 时接口返回 404。密钥不经过 PocketBase，也不发给浏览器。

[百度 AI Studio 异步接口](https://ai.baidu.com/ai-doc/AISTUDIO/fml7mozw5)限制：URL 文件 200 MB、
本地上传 50 MB、单次请求 1000 页。百度在每次链接提交中同步下载整份文件（约 2 MB/s），
而 GitHub Runner 直接上传到百度只有 20–25 KB/s。因此：

- 40 MB 以下的源文件：百度按页码范围直接拉取原链接。
- 40 MB 以上（含超过 200 MB 的文件）：Runner 按 25 页切段，上传到本接口，百度只拉取各段的中转链接。
- 中转不可用时才退回 Runner 直传；扫描页先转为 150 DPI JPEG 页面以缩小体积。

2026-10-22 一份 238 页、209,968,268 字节的扫描版 PDF 因超过 200 MB 链接上限，
又在固定 60 秒提交超时后退回直传，OCR 7 分钟只完成约 30 页。上述中转用于修复这种情况。

前端、Worker 和 R2 绑定在同一次 Remote 部署中发布。执行 `npm run preflight` 与
`npm run test:browser` 后，通过原有 `deploy-cloudflare.yml` 部署；只测试本地 workerd 时
不会访问生产 R2。`npm run worker:types` 可在修改绑定后更新 Worker 类型。

转换调度已迁移至独立 Cloudflare Worker `anyworkflow-file-converter`，始终触发转换仓库的 `main`。
旧 Docker PDF 服务曾固定在 `ccr-c3760b73-h8uc5y`，导致生产未使用 main 的优化；不要恢复这项配置。
部署、密钥、切换和回退见 [转换调度 Worker](file-converter-worker.md)。

## 2026-10-22 实测

[转换测试 Action](https://github.com/ActiveInsighter/file-converter-ai/actions/runs/39743124570)
使用 R2 自定义域名上的公开模型卡，46,824,360 字节、64 页，只识别第 1 页：

- Runner 下载与规划约 2.2 秒。
- 百度链接提交（包含整份文件拉取）约 23.4 秒，有效吞吐至少约 2 MB/s。
- 下载开始至完成单页转换约 43 秒；不是整份 64 页转换耗时。
- `remote_jobs=1`、`uploaded_jobs=0`、`failed_pages=0`，没有退回 Runner 上传。

生命周期删除策略参考 [Cloudflare 文档](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)。
