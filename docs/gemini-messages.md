# Gemini 文本消息

入口 `/gemini`，侧边栏「Gemini 消息」。直接填写消息即可提问；也可从资料库多选 `.md`
文件，或在「粘贴正文」粘贴 Markdown。每个分段是独立请求，不共享对话历史。
系统提示词以 Gemini `systemInstruction` 发送；消息提示词与当前分段作为 user 文本发送。
没有 PDF 转录规则、图片、附件上传或 Gemini Files API。

## 分段

默认分隔符为独占一行的 `<!-- aw:split -->`，例如：

```markdown
# 第一节
需要处理的第一段正文。

<!-- aw:split -->

# 第二节
需要处理的第二段正文。
```

可自定义单行字面量，按整行匹配，不作为正则表达式。不拆分 fenced code 或缩进代码里的
分隔符；默认注释也不会碰到 frontmatter 的 `---`。连续、开头或末尾分隔符不会产生空请求。
只移除分段边界的空行，保留代码缩进、硬换行空格和内容顺序。未找到分隔符时整份正文为一段。
多个文件分别分段，先补充正文，再按文件选择顺序编号；不跨文件拼接。

预览与创建调用同一份 PB 规则，预览不创建记录。最多 20 个文件、100 段；正文、文件和
提示词合计最多 2 MiB，单段最多 128 KiB。超限明确报错，不自动截断。并发为 1–16，默认 5。
思考程度默认不传，让所选模型自行决定；显式值需由所选模型支持。

## 资料库

资料库支持 PDF 和 UTF-8 Markdown。MD 最大 2 MiB，接口 `PUT /api/library/files/markdown`
接收原始文本及 `X-File-Name`，逐块检查字节上限和 UTF-8；不会把 MD 交给 PDF 转换器。
`GET /api/library/files?ext=md` 按类型筛选，`GET /api/library/files/<id>/text` 验证账号后读取正文。
MD 与 PDF 复用文件夹、重命名、移动、删除和上传队列；重命名不能修改扩展名。
随机来源链接沿用资料库的能力链接语义，MD 使用 text/plain、nosniff 和 CSP sandbox 响应。

## 数据与执行

- `aw_gemini_jobs`：任务、提示词、模型参数快照、计数及 GitHub 运行身份。
- `aw_gemini_messages`：有序分段输入、来源、逐段回复、错误、finish reason 和 token 使用量。
- `aw_gemini_services`：仅执行器使用的专用账号，不具有管理数据库或读取其他业务集合的权限。

创建请求使用固定 15 位 ID 和服务端输入 hash 保持幂等。PB 在同一事务创建任务及分段，
普通客户端不能直接改状态、正文或回复。用户只能读取自己的记录、申请取消和删除终态任务。
删除任务级联删除该任务分段，不影响资料库文件。

Cloudflare 复用 shared task kit 的 GitHub 执行器，派发 `file-converter-ai/gemini-text.yml`，
workflow input 只有 `request_id`。不同 Gemini 对话可独立并发执行（调度器同时最多 4 个），
无需等待前一个对话结束；PDF 与文本任务也不再互相阻塞。
GitHub Actions 按 `request_id` 分组，保证不同对话的工作流互不排队，
同一请求不会因重复派发而相互取消。运行内部 KeyPool 仅控制单个 Runner，
多个并行任务可能共同触发 Google 项目级配额，应关注 429/限额。

执行器先领取任务，再为每段取得一次发送许可。重复领取、丢失派发响应、重跑 Actions 或
丢失发送许可均不授权重复生成。429/临时服务错误有界重试；传输超时不盲目补发。
回复写入可重试且幂等，保存失败不会再次调用模型。
达到输出上限时保存原始截断文本并标记该段失败；空回复、拒答、失败段也有独立错误。
取消后停止领取新段，进行中的回复可继续保存。GitHub 结束时将未完成段收敛为失败或取消。

列表只读取元数据；点开某段才读取正文与回复。活跃状态每 5 秒更新，终态元数据降至
30 秒；终态回复停止轮询。隐藏标签页暂停轮询。模型 Markdown 作为不可信文本渲染，不执行 HTML
或加载图片。任务中心与侧边栏沿用统一生命周期和进度。

## 发布顺序

1. 先部署 `AnyWorkflow-workers` 的 `1794700000_gemini_messages.js` migration 及三个
   `gemini*.js` hooks 和 `aw_gemini.pb.js`，重启 PB。
2. 在 `ActiveInsighter/file-converter-ai` 配置 Actions Secret `POCKETBASE_SERVER_TOKEN`，
   填入有效的 PB 超级用户令牌，执行器即可使用它读写整个数据库；不下发前端。
   如需专用账号，可改为在 PB 的 `aw_gemini_services` 创建 email/password 账号。
3. 使用专用账号时配置 Actions secrets `GEMINI_PB_EMAIL`、`GEMINI_PB_PASSWORD`；
   `POCKETBASE_SERVER_TOKEN` 非空时优先使用它。复用 `GEMINI_API_KEYS` / `GEMINI_KEY_GROUPS`。
   `GEMINI_PB_URL` 为 Actions variable，默认 `https://pb.any1.tech`。
4. 发布转换仓库，确保 `main` 有 `gemini-text.yml` 和 `gemini_text.py`。
5. 发布 Remote 的 converter Worker，再发布 Remote Web Worker。沿用现有 PB/GitHub secrets
   和 `FILE_CONVERTER` / `LIBRARY_FILES` bindings，不需要新建 R2 桶或增加 Cloudflare 密钥。

部署前先完成 PB schema；新的配额协调器会同时查询两个任务集合。
执行器 GitHub token 需具备转换仓库现有 Actions dispatch/read/cancel 权限。
配套后端说明见 `AnyWorkflow-workers/deploy/gemini-messages.md`。

如果 PB 暂时不可写，workflow 会保留三天的 `gemini-text-recovery-<runId>` artifact。
解压后使用执行器专用凭据运行：

```sh
python gemini_text.py --recover-dir ./recovery
```

该模式只恢复数据库写入，不调用 Gemini。PB 只接受原执行身份、已经取得发送许可且尚未保存
结果的分段，不能覆盖已有回复。已取消任务保留取消状态；其他终态任务重新计算完成状态。

## 验证

```sh
npm run preflight
npm run test:browser -- gemini pdf library
# 在后端仓库
POCKETBASE_BINARY=/path/to/pocketbase npm test
# 在转换仓库
python -m unittest discover -s tests
```

真实 PB 验证使用临时数据库与账号；浏览器、Cloudflare 和 Gemini 测试使用隔离 fixture/mock，
不向生产 Gemini 发消息，也不写生产 PB/R2。


## 模型库与消息配置

`/settings/models` 管理当前账号保存的 Gemini 模型。消息页标题栏和文件转换配置中的
模型管理按钮打开同一模型库，所有选择器使用 `features/models` 的 `SavedModelSelect`。
模型别名、添加和移除保存在 `aw_saved_models`，按 owner 隔离；移除不改写已有任务或配置。
当前历史模型 ID 即使未加入模型库仍可选，避免旧配置失效。

官方目录使用 `GET https://generativelanguage.googleapis.com/v1beta/models`，处理全部分页，
保留真实返回的模型 ID、方法、上下文上限与思考能力。当前选择器只提供支持 `generateContent`
的常规 Gemini 模型，过滤专用语音、图像等接口；目录本身保留所有元数据。Models API 未提供
完整的输入模态标记，不能把它当作视觉能力保证，文件转换需选支持图像输入的模型。

刷新通过已认证的 `POST /api/models/catalog/refresh` 进入私有 converter service binding，
PB 事务生成同步 nonce，同一轮只派发一次 `gemini-models.yml`。执行器使用仓库已有的
`GEMINI_API_KEYS` 调用官方接口，使用 `POCKETBASE_SERVER_TOKEN` 写入 `aw_model_catalog`。
密钥不经过浏览器。每日 UTC 02:17 自动同步，也可点击刷新；失败保留上次成功目录，
过期同步可在 10 分钟后重新发起。普通账号不能覆盖目录或伪造模型元数据。

消息页的默认模型、系统提示词、分隔符、并发和配额参数在「消息配置」统一编辑。
配置通过 `/api/anyworkflow/gemini/config` 保存在 `aw_gemini_configs`，使用 expectedRevision
拒绝覆盖其他页面的修改。提交时冻结当前配置与所选模型，后续修改不影响历史任务。
分段预览为独立阅读窗；回复桌面为左侧分段导航、右侧回复/原文，手机使用原生分段选择器。

增量发布：先应用 `1794710000_shared_models.js` 和 `models.js`、`aw_models.pb.js`，
同时更新 `gemini.js` 的完整预览字段；再发布执行器 workflow 并完成首次目录同步，最后发布 Remote。
无需新增 Gemini Secret，使用仓库已有密钥即可。

## 消息界面与读取接口

发送成功后直接打开对话，地址中的 `job` 参数可复制或刷新。
提问与回复使用 shadcn Message Scroller、Message 和 Bubble，支持复制、Markdown
下载和滚动到最新回复；批量任务保留桌面分段列表和手机 Animate UI 选择器。

消息详情改为 `GET /api/anyworkflow/gemini/jobs/{id}`，在同一事务内返回任务与
分段摘要；摘要查询不读取正文或回复大字段。选中的分段通过
`GET /api/anyworkflow/gemini/jobs/{id}/messages/{message}` 按需读取。
后端逐级核对属主和任务关系，旧消息无需迁移。执行器仍使用现有 claim/start/complete
协议；全部结果保存后立即更新终态，取消立即阻止后续发送，已获许可的结果仍能补存。

模型库支持手动输入模型 ID（可带 `models/` 前缀）与自定义名称，
不要求 `gemini-` 前缀，不依赖官方目录或目录能力标记；例如 `Antigravity` 可直接保存、配置和提交。与文件转换共用已保存模型。添加成功不代表模型在当前
API Key 下可调用；真实 API 错误显示在相应消息中。

## Antigravity Agent

保存的 ID 为 `Antigravity` 或 `antigravity-*` 时自动按 Agent 调用，不再发给
generateContent。别名解析为 `antigravity-preview-09-2026`；使用 Interactions API 的
`agent` 参数。消息配置切换到该 ID 后显示 Agent 专属参数，隐藏普通模型的输出上限
和思考程度，避免向 Agent 发送不支持的生成参数。

默认使用 Gemini 4 Hydrogen；代码执行、文件系统、Google 搜索、URL Context 全开，
不限制出站域名，无附加 Token 预算。时限默认 175 分钟，可在 Agent 配置内缩短。
Agent 分段并发为 16，密钥轮转配置使用应用上限 RPM 60、RPD 10000；实际配额由
上游返回的限流信息处理。权限仅作用于 Google 托管沙盒，不把 PB/GitHub/API Key
配置为沙盒环境变量或文件。

服务端在 `aw_gemini_messages.providerState` 保存 interaction ID、环境 ID、
凭据指纹与状态；checkpoint 路由只接受匹配 GitHub execution ID 的执行器。
创建的响应不确定时不会重发，已有 ID 仅通过 GET 轮询；用户取消会停止远程 Agent。
发布顺序：PB migration/hooks → file-converter-ai 执行器 → Remote。
官方协议：https://aistudio.google.com/docs/antigravity-agent
