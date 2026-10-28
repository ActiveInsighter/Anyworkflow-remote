# PDF 一天热存储与 Workers Assets 归档

实现位置：`worker/archive.ts`（读取）、`worker/archive-admin.ts`（受保护的 CI 桥接）、
`scripts/archive-files.mjs`（发布事务）、`archive-worker/index.js`（私有资源服务）。
本功能需要完成下述上线配置后才会自动运行；本地测试不会更改生产资源。

## 行为与数据结构

- 上传仍走原有分片接口，最大 2 GiB。资料库原件在 `anyworkflow-library`，旧入口及 OCR 分段在 `anyworkflow-ocr-relay`。
- `archive-pdfs.yml` 每小时第 17 分扫描上传满 24 小时的原件；以 **24 MiB** 为边界按原始字节切分，不按 PDF 页面重写，最后一片可以不足 24 MiB。
- 分片 SHA-256 的前 32 个十六进制字符作为 Assets ID；索引保留完整 SHA-256。相同内容去重，截断哈希碰撞时停止发布。
- 独立 Worker `anyworkflow-pdf-archive` 保存 `/chunks/<hash>.bin`，只通过 `PDF_ARCHIVE` 服务绑定访问，不配置公开域名、workers.dev 或预览 URL。
- 完整资源清单始终包含两桶的 `archives/*.json` 和 `archive-pending/*.json`。Assets 每次部署替换整个资源集合，不能只上传本轮的新文件清单。
- 一份文档的全部分片必须同时发布。运行器通过生产使用的服务绑定重新下载每片，核对长度与完整 SHA-256；还会在保留 R2 原件时，通过同一下载实现完整重组每份文档并逐片复核哈希；全部待提交文档都通过校验后，逐份持久化 `archives/<原 key>.json`，再删除原 key 的 R2 文件，最后删除 pending 索引。
- 归档清单复制原始大小、上传时间、ETag 和私有归属 metadata。R2 仍保存小型索引、资料库 owner 索引、删除标记和导入进度，PDF 主体迁往 Assets。
- 资料库 `sourceUrl` 不变。`ocr-files.any1.tech/*` 路由进入 Remote，兼容既有任务及 OCR 链接。`/*.pdf` 必须先运行 Worker，避免导航请求被 SPA fallback 改写为 HTML。
- 下载通过原生 `pipeTo` 和 `FixedLengthStream` 顺序拼接，避免逐网络块 JavaScript 回调及整文件缓冲。支持 HEAD、单范围 Range、尾部范围和 ETag If-Range；跨片 Range 仅读取涉及的片段。内部始终读取完整 Assets 分片，完整片直接流转，仅边界片在最多 24 MiB 的缓冲中截取，避免不同生产服务绑定对 Range 的行为差异；不依赖 CDN 或缓存命中才能正确读取范围。
- 资料库按原来的账号验证元数据和删除权限；删除标记立即阻断所有新下载。Assets 当前及历史部署中的不可公开访问的分片不会立刻物理擦除，本版不回收已删除文件的归档分片。
- 历史导入若发现旧原件已归档，直接建立指向相同分片的新资料库索引，不把完整 PDF 再复制回 R2。

## 首次启用

1. 先取消**两个桶全部已启用的对象删除生命周期**，保留未完成分片的一天自动中止规则。
   尤其要移除旧 `expire-pdfs-after-1-day` 的对象删除操作。可在 Cloudflare R2 控制台操作，
   或使用 `wrangler r2 bucket lifecycle list <bucket>` 检查、按规则 ID 删除旧的到期规则。
   若一个规则同时负责中止分片和删除对象，编辑时仅移除删除对象操作。
   这是避免迁移任务停机时原件被独立清理的必要步骤；归档运行器每次都会用 API 检查，发现对象删除规则便拒绝迁移。
2. 生成一个至少 32 字符的随机密钥，以受保护的 stdin 分别写入 Remote Worker 的
   `ARCHIVE_ADMIN_SECRET` 和本仓库 GitHub Actions 的同名 secret。不要把值放到源码、命令参数、聊天或日志。
   GitHub Actions 原有 `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` 继续使用；
   API Token 需要目标账号 Workers Scripts Edit、R2 读取生命周期的权限，Remote 发布身份还需管理 `any1.tech` 的 Workers 路由。
3. 设置仓库 Actions variable `PDF_ARCHIVE_GATEWAY` 为**生产 Remote 的 HTTPS origin**。
   不要填 `ocr-files.any1.tech`，不要填 preview origin。桥接路径是 `/api/internal/pdf-archive/*`。
   只给生产 Remote 配置归档 secret；preview 无需归档管理权限。
4. 通过现有 `deploy-cloudflare.yml` 发布生产。流程先运行 preflight，再用 `--bootstrap` 确保私有归档 Worker 存在，
   最后部署 Remote 的服务绑定和旧域名路由。bootstrap 在 Worker 已存在时完全不部署，避免清空历史 Assets。
   预览部署也会确保服务存在，但不接管旧域名路由。
5. 确认生产部署 Action 绿色，手动运行 `archive-pdfs-to-worker-assets` 一次。
   检查日志 `pdf_archive_completed`，再对一个已归档文件完整下载并比较 SHA-256，
   用其原 `sourceUrl` 发起转换。确认 R2 原 key 不再存在、`archives/<key>.json` 存在，随后使用每小时定时任务。

部署顺序先停止危险的 R2 自动删除，再接通新读取链路，最后启用归档任务。不要先清空原件。
生产启用与验证状态以 GitHub Actions 的部署和归档演练记录为准。

## 失败、容量和运行边界

- 一天表示**上传满 24 小时后符合迁移条件**，不是硬删除截止时间。每小时调度加上 GitHub Actions 排队可能带来延迟；归档失败时保留 R2 原件并让 Action 失败，下一轮重试。
- 在 Assets 的注册、上传、部署、服务绑定读取或 SHA-256 验证失败时，不提交该轮原件删除。
- pending 在发布前写入 R2。Runner 丢失缓存时从原件重新取片；发布后、提交前中断也可安全重跑。
  若中断发生在持久化归档指针后，原件可能尚在 R2；读取优先 R2，下一轮验证后完成清理。
- GitHub concurrency 防止定时和手动任务重叠；R2 条件写入的独占租约同时防止其他运行器并发发布。
  租约 body 使用随机值，避免只更新 metadata 导致 ETag 不变。租期 2 小时，HTTP 适配器有 50 分钟截止时间，Actions 55 分钟超时。
  作业被强制杀死时等租约到期后恢复，不要在旧进程仍运行时手动重置租约。
- 每轮最多 100 个文件、8 GiB。到期文件较多时会分多轮处理；需关注失败 Action 和 R2 容量。
- 硬限制为每个归档 Worker **20,000 个唯一分片**（保守按免费版），24 MiB 满片约 469 GiB。
  小文件一份占一片，实际容量取决于文件大小。达到上限时停止并保留 R2 原件；本版不自动创建额外 Worker。
- 新文件上传高峰一天内仍可能超过 R2 的免费额度；10 GB 是账号级免费用量，不是本方案的硬配额限制。
- 归档服务承担重组下载的 Worker 请求和服务绑定调用，不能把所有重组请求都按纯静态资源免费请求估算。
- 不要用空目录对归档 Worker 执行 `wrangler deploy`，不要回滚到缺少后来已提交文件的 Assets 版本。
  暂停定时归档不会影响已有文件读取；回退 Remote 到不认识归档索引的旧版本会令已移走原件的文件不可读。
- 不要删除 `archives/` 或 pending 小索引，它们同时是读取索引和未来完整部署清单的依据。

## 验证

```bash
npm run test:archive
npm run preflight
```

测试使用本地 workerd 和真实模拟 R2 binding，Cloudflare 发布 API 与私有资源服务由本地假服务模拟：
超过 25 MiB 的有效 PDF、两片完整重组、SHA-256、跨片/尾部 Range、HEAD、If-Range、
旧链接、归属隔离、删除阻断、租约争用、20,000 片容量、哈希碰撞、完整清单保留，
以及上传/部署/读取失败和内容损坏后的原件保留与重试、提交中断恢复和 24 小时资格检查。
另有测试直接使用本地原生 ASSETS 绑定与归档 Worker 代码，验证完整流与跨片范围，并覆盖绑定忽略 Range 的行为。
2026-10-28 本地验证还将归档重组得到的 27,263,491 字节有效 PDF 交给转换执行器使用的 PyMuPDF，成功解析 1 页并渲染为 612×792 图像；转换执行器已有 180 项 unittest 全部通过。
本地检查不能替代生产 Cloudflare 发布、域名路由和第三方 OCR 的联网验证。

归档工作流还提供手动 `verify=true` 演练：使用无敏感内容的合成 26 MiB 单页 PDF，
通过账号管理 API 建立本次测试文件的 pending 索引，立即执行相同发布/哈希验证/删除事务，
再检查旧域名的完整下载、跨片 Range 和 R2 原件确已删除，并上传 JSON 验证记录。
此演练只选择新创建的测试 UUID，生产候选筛选和 stage 的 24 小时检查保持不变。
演练使用 R2 管理 API，因此执行身份需具有该桶的对象读写权限。

协议依据：[Assets 直传与完整清单](https://developers.cloudflare.com/workers/static-assets/direct-upload/)、
[Workers 平台限制](https://developers.cloudflare.com/workers/platform/limits/)、
[R2 生命周期 API](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/lifecycle/methods/get/)。
