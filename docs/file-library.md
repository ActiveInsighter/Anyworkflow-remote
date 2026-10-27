# 持久文件资料库

`/library` 保存 PDF 原文件；原有收藏、模板及其目录迁到 `/favorites-and-templates`。
旧 `/library?tab=templates`、带 folder 的地址继续重定向。收藏和模板的 PocketBase 集合与目录记录不变。

上传页和转换页共用 PDF 上传组件、分片传输和账号会话。转换页新增“资料库”来源，
在提交前再次检查文件是否存在，再把同一 `sourceUrl` 写入原 `aw_pdf_to_md_jobs`。
不同的页码范围、模型配置、提示词与任务记录共用一份原文件。取消选择不会删除资料库文件。

## 浏览与操作

资料库与收藏和模板共用 `src/components/drive/` 的云盘式浏览器：

- 顶部搜索覆盖全部文件夹；排序（名称、修改时间、大小）与列表/网格视图按页面记在本机。
- 点击文件夹进入，当前文件夹写入 `?folder=`，每进入一层增加一条历史记录，返回键逐级退出。
- 每个条目的 ⋮（桌面也可右键）打开操作面板：手机为底部弹出，宽屏为悬浮面板。
  重命名、移动、删除确认以面板内的下一页打开；移动时在面板里逐级浏览目标文件夹。
- 新建：手机为右下角悬浮按钮，展开“上传 PDF / 新建文件夹”；宽屏为页头的“新建”。
  资料库支持一次选择多个 PDF 或拖放到页面，按顺序上传到当前文件夹，底部显示进度。
- 删除文件夹不会删除内容：其中的文件、收藏、模板和子文件夹移到上一级。

## 存储及访问

- `LIBRARY_FILES` 是私有 R2 bucket；生产配置 `anyworkflow-library`，预览配置 `anyworkflow-library-preview`。
- 文件使用随机 UUID key，目录索引按 owner 分开保存；文件名及 owner 元数据不经过公开 bucket。
- `GET /api/library/files`、单文件详情、PATCH（重命名、移动）及 DELETE 均验证固定 PocketBase 的 aw_clients 会话。
  列表支持 `limit`（1–1000，默认 100），前端一次载入全部文件后在本地按文件夹浏览。
- 文件夹保存在同一 bucket 的 `folders/<owner>/<UUID>`，每个文件夹一个对象，元数据为名称和上级；
  `GET/POST /api/library/folders`、`PATCH/DELETE /api/library/folders/<UUID>`。移动会拒绝移入自身或子文件夹。
  文件所在文件夹和可修改的文件名记在该文件的索引对象上；存储对象保留上传时的名字。
- 新上传使用 `/api/library/files/uploads/multipart`，原先的临时上传接口继续兼容旧页面及 OCR 中转。
- 新上传的签名票据使用 v2；临时上传使用 v1，禁止跨接口使用票据。
- 上传完成才写目录索引，重复 complete 返回同一文件。删除先写 tombstone，迟到的 complete 不能恢复文件。
- 原文件保留到用户主动删除；只有未完成分片一天后清理。禁止给资料库 bucket 配置一天删除全部对象的规则。
- `/api/library/sources/<UUID>.pdf` 是无须登录的随机能力链接，供 Actions 和百度 OCR 下载。
  持有链接者可读文件，不返回 owner 或其他目录；响应 no-store，支持 HEAD、Range、If-Range。
- 删除立即使原链接失效。未读取源文件的任务及后续重跑会失败；既有转换记录与 ZIP 保留。

## 旧文件迁移

首次打开资料库或选文件时按当前账号的历史转换记录分页检查旧 `ocr-files.any1.tech/<UUID>.pdf`。
仍存在的原文件流式复制到新 bucket 并建立索引；重复引用只导入一次，旧原件不修改。
迁移结果按账号保存，已删除文件不会因重复导入恢复。已经按旧生命周期清理的文件无法恢复，
页面提示重新上传。没有提交过转换且旧对象没有 owner 信息的临时上传无法可靠归属，不自动导入。

## 预览和发布

预览 workflow 使用 `wrangler deploy --env preview`。预览文件独立存储，现有 PocketBase 及
转换调度器仍与生产共享。预览链接受应用现有登录保护，PDF 随机来源链接用于转换器访问。

预览 bucket 已创建并只设置 `abort-incomplete-after-1-day`。正式合并上线前创建
`anyworkflow-library`，设置同样的未完成分片清理规则，并确保生产 Worker 的上传票据密钥保留。
转换执行器已经通过现有 source_url 协议支持新链接，配套分支增加删除源文件的明确错误提示。

验证：`npm run preflight`、`npm run test:browser`、`scripts/library-worker.test.mjs`。
新增浏览器回归涵盖两处上传、刷新持久化、不同任务复用、搜索、删除重试、旧地址迁移、
320/390/760/1440px 和浅色/深色模式。Worker 回归覆盖鉴权、跨账号隔离、范围读取、
永久保留、删除及重复完成、历史上传导入。全套测试使用隔离模拟，不访问生产记录。
