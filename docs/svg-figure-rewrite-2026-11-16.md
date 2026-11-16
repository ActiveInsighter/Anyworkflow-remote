# PDF 插图拼接与 SVG 重绘验证（2026-11-16）

## 修改范围

复用两个仓库的远端 `feat/svg-figure-rewrite` 实现：

- `file-converter-ai`：基线 `165d01b`，工作区 `/home/dev/Documents/Project/file-converter-ai/.worktrees/svg-figure-rewrite`。
- `Anyworkflow-remote`：基线 `926fc83`，工作区 `/home/dev/Documents/Project/Anyworkflow-remote/.worktrees/svg-figure-rewrite`。
- 配套后端 `AnyWorkflow-workers`：基线 `9d21753`，工作区 `/home/dev/Documents/Project/AnyWorkflow-workers/.worktrees/svg-figure-rewrite`。

转换器提交 `39c21a2`，后端提交 `480d8d3`。

三个工作区均使用本地 `fix/svg-figure-rewrite` 分支，不覆盖项目原目录的未提交改动。

## 已补齐的问题

原远端分支已有 SVG 请求和 Remote 配置 UI，但存在两个实际阻断：转换工作流未接收 SVG 设置，
PocketBase 校验与后端任务派发源模块尚未接受新字段。Remote 内手工修改的共享模块也需要回到后端维护。

修复后，服务端把 SVG 开关、独立接口、模型和提示词写入新任务快照，派发端将图片质量与 SVG 设置打包为
`image_config`。转换器先使用已有 PDF 坐标恢复算法拼接同图碎片，再把完整裁图交给 SVG 模型，
与正文转录并行。同接口、地址及密钥共用配额桶；独立接口分别统计请求及配额。

模型结果需要为标准命名空间、有效 viewBox、包含矢量内容且不依赖外链的 SVG；位图嵌入、脚本、
损坏 XML、空图均失败并保留原图。支持 SVG 中的嵌套 SVG 子图与本地 marker 等资源。
写入采用临时文件替换，取消时等待请求任务退出，读图失败也会计入统计。

最终合并 Markdown 和分页面 Markdown 仅替换成功图片的引用，下载目录同时保留原图供核对。
缺失 SVG 文件不会覆盖有效原图链接，带 title 的图片也能正确复制。Actions Summary 展示 SVG 成功/失败数量。

## 验证证据

- 转换器：`python -m unittest discover -s tests`，315 项通过；编译与 `git diff --check` 通过。
- 后端：设置 `POCKETBASE_BINARY` 后运行 `npm test`，364 项通过、0 跳过，包括新增的真实 PocketBase JSVM SVG 配置验证。
- Remote：`npm run preflight` 通过，包含回归、workerd 运行时、类型检查与生产构建。
- 跨仓库检查：Remote 默认设置 → 后端真实校验 → 工作流输入构造 → Python CLI；SVG 默认提示词在三仓库完全一致。
- 工作流入口保持 25 个输入；派发字段均在工作流声明的白名单内。
- 本地 HTTP 端到端：真实下载 PDF，模拟 OCR 服务返回两个相邻碎片及一个独立插图；实际恢复裁图，
  通过 Gemini 和 OpenAI 兼容协议分别发送 SVG 与正文请求。合并图成功生成 SVG；独立插图故意返回无效 SVG，
  最终仍引用 PNG。验证原始碎片没有重复下载、正文/图题保留、合并/分页面引用正确、原图存在和独立配额统计。
- SVG 配置专项浏览器测试通过：启用/关闭、提示词恢复、接口/模型独立、保存配置、任务快照，以及 320/760/1440px。
  已人工查看手机与桌面截图。

浏览器用例按批次覆盖全部 18 个场景，最终 17 个通过，1 个失败：`gemini` 用例等待隐藏的
“输入 40,000”详情超时。未修改的远端基线 `926fc83` 运行同一用例亦在同一断言失败，保留对照日志，
未把该问题算作本次修复通过。首轮 `editor` 受开发时热更新干扰，`pdf` 与 `history-messages`
出现等待超时；稳定源码后这三个完整用例均已重跑通过。SVG 专项及完整 PDF 用例均通过。
首轮长任务在运行环境时限处结束，剩余 `start-links`、`task-center`、`ui-motion` 已另批完成并通过。

本地证据位于 Remote 的 `.deployment-evidence/svg-rewrite/` 与转换器的 `work/svg-validation/`；
这些日志、截图和构建产物不进入源码提交。

## 调用与发布

[GitHub 官方文档](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)
规定 `workflow_dispatch` 最多 25 个顶层输入。现有入口已经用满，因此图片参数合并为一个 JSON 输入：

```json
{
  "jpeg_quality": 95,
  "svg": {
    "enabled": true,
    "provider": "gemini",
    "model": "gemini-3.5-flash-lite",
    "prompt": ""
  }
}
```

旧的 GitHub API 直接调用若发送顶层 `jpeg_quality`，需改为 `image_config.jpeg_quality`；
Remote 和 Node 回退派发端已适配。Python CLI 原有的 `--jpeg-quality` 保持可用。
历史任务缺失 SVG 设置时继续使用原始图片；新任务使用服务端保存的默认启用设置，关闭后不发 SVG 请求。

三部分需要配套发布：转换器工作流/代码 → Remote 转换调度器 → PocketBase hooks 和 Remote 前端。
顶层图片参数协议发生调整，转换器与调度器应在同一发布窗口更新。
无需更改 PocketBase 集合或执行数据库迁移。

当前改动仅在本地工作区，尚未推送、合并或部署。本机未配置模型或 OCR 密钥，端到端使用本地假服务；
因此没有将本次验证描述为真实 AI 重绘质量验证。真实模型生成的文字、箭头、比例与原图一致性，仍需发布前取样实测。
