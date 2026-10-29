# Run 编辑器

编辑器分两层：`features/editor` 是与账号无关的 DSL 编辑器，`features/run-editor` 把它接到 Run、模板、草稿、执行计划和运行配置上。

## 分层

```text
features/editor/
├── lib/                       纯逻辑（node 测试可直接 import，只用相对路径）
│   ├── dsl-language.ts        分词与高亮
│   ├── dsl-completion.ts      补全；start_url 选项由 startLinkOptions Facet 注入
│   ├── dsl-format.ts          格式化（不改消息正文的缩进）
│   ├── dsl-folding.ts         按结构折叠（同一次结构扫描，按文档版本缓存）
│   ├── source-structure.ts    块结构扫描：Task / Event / Act / 循环 / 消息
│   ├── outline.ts             大纲树、光标所在路径、计数
│   ├── start-url.ts           定位 Task 自己的 start_url，设置或插入
│   ├── editor-commands.ts     插入 / 智能复制 / 删除 / 复制一份 的位置规划
│   ├── editor-command-meta.ts 所有命令的名称、说明、快捷键（纯数据，不引入 CodeMirror）
│   ├── editor-command-registry.ts  命令行为，按同一 id 对应
│   ├── editor-extensions.ts   CodeMirror 扩展；只读、快捷链接、行号、换行在 Compartment 中就地切换
│   └── editor-preferences.ts  字号、换行、行号、侧栏（按设备存 localStorage）
├── hooks/                     useCodeMirror、useEditorCommands、useEditorFullscreen、useEditorPreferences
└── components/                外壳、工具栏、起始页菜单、更多菜单、大纲与问题侧栏
```

- **命令只定义一次。** 工具栏、菜单、CodeMirror 快捷键和设置里的快捷键列表都读 `EDITOR_COMMAND_META`（`lib/editor-command-meta.ts`，纯数据；行为在 `editor-command-registry.ts`）。
  命令不碰界面，只返回结果（成功 / 提示 / 失败），由外壳统一 toast。新增命令：在元信息列表加一项，
  在行为注册表实现对应 id，在 `components/command-icons.ts` 配图标，再决定放进工具栏还是“更多”菜单。
- **账号数据从外部传入。** 编辑器通过 `startLinks` 属性拿到快捷链接和“管理 / 添加”回调，
  自己不读写后端；`run-editor/hooks/use-editor-start-links.ts` 负责接线。
- **DSL 规则不在这里。** 校验来自 `lib/workflow-dsl`（与扩展、workers、MCP 共用规则和夹具）。
  编辑器的结构扫描只用于插入位置、折叠和大纲，不决定计划是否有效。

## 交互

- 宽屏（≥1280px）：代码右侧是“大纲 / 问题”侧栏，可用“结构”按钮收起；窄屏改为底部面板。
- 大纲随光标高亮当前所在的 Task / Event / 循环，点击跳转。
- “起始页”菜单把光标所在 Task 的 `@let start_url=` 设为选中的快捷链接（没有就插入）；
  当前地址不在列表里时可直接“添加到快捷链接”。
- 保存或运行时如有 DSL 错误，不会写入后端，编辑器选中第一个错误（宽屏同时打开问题列表）。
- 快捷键：`Ctrl/⌘ S` 保存、`Ctrl/⌘ F` 查找替换、`Shift Alt F` 格式化、`Ctrl/⌘ Shift D` 复制一份、
  `Ctrl Space` 补全；完整列表见“设置 → 快捷键”。

## 快捷链接

`lib/domain/start-links.ts` 定义模型、默认值与校验，`lib/api/user-preferences.ts` 读写
PocketBase `aw_user_preferences`（每个账号一条记录，仅属主可读写，迁移在 workers 仓库）。
`features/start-links` 的 store 按账号隔离，先显示本机缓存再同步；未保存过时使用默认的五个页面。

它和运行配置的页面列表（`lib/domain/runtime-pages.ts`）是两回事：后者是 `pageOverrides` 的后端契约，固定不可编辑。
