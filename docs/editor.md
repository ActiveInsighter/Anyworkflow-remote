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
│   ├── source-structure.ts    块结构扫描：Task / Event / Act / 循环 / 消息（多行循环表头由共享 kit 读取）
│   ├── outline.ts             大纲树、光标所在路径、计数
│   ├── act-preview.ts         预览页的数据：展开后的 Event / Act，光标所在 Event 单列
│   ├── start-url.ts           定位 Task 自己的 start_url，设置或插入
│   ├── editor-commands.ts     插入、循环模板、复制 / 删除 / 复制一份 / 选择块 的范围规划
│   ├── editor-flash.ts        复制后的短暂高亮（含系统复制）
│   ├── editor-theme.ts        CodeMirror 外观；颜色来自 tokens/color.css 的 --cm-*
│   ├── editor-command-meta.ts 所有命令的名称、说明、快捷键（纯数据，不引入 CodeMirror）
│   ├── editor-command-registry.ts  命令行为，按同一 id 对应
│   ├── editor-extensions.ts   CodeMirror 扩展；只读、快捷链接、行号、换行在 Compartment 中就地切换
│   └── editor-preferences.ts  字号、换行、行号、侧栏（按设备存 localStorage）
├── hooks/
│   ├── use-editor-controller.ts  外壳的全部行为：视图、命令、全屏、侧栏、导航、派生数据
│   ├── use-editor-focus.ts       工具栏焦点策略（见下）
│   └── use-code-mirror / use-editor-commands / use-editor-fullscreen / use-editor-preferences
└── components/                外壳（只负责布局）、工具栏、循环菜单、起始页菜单、更多菜单、侧栏（大纲 / 预览 / 问题）
```

- **命令只定义一次。** 工具栏、菜单、CodeMirror 快捷键和设置里的快捷键列表都读 `EDITOR_COMMAND_META`（`lib/editor-command-meta.ts`，纯数据；行为在 `editor-command-registry.ts`）。
  命令不碰界面，只返回结果（成功 / 提示 / 失败），由外壳统一 toast。新增命令：在元信息列表加一项，
  在行为注册表实现对应 id，在 `components/command-icons.ts` 配图标，再决定放进工具栏还是“更多”菜单。
- **账号数据从外部传入。** 编辑器通过 `startLinks` 属性拿到快捷链接和“管理 / 添加”回调，
  自己不读写后端；`run-editor/hooks/use-editor-start-links.ts` 负责接线。
- **DSL 规则不在这里。** 校验来自 `lib/workflow-dsl`（与扩展、workers、MCP 共用规则和夹具；循环由
  `shared/dsl-kit/loops.mjs` 实现）。编辑器的结构扫描只用于插入位置、折叠和大纲，不决定计划是否有效。
  `inspectWorkflowSourceCached` 让 linter、预览、大纲计数和保存检查共用同一次检查结果。
- **焦点策略。** 手机上工具按钮一旦抢走焦点，键盘会收起、页面跳动，再聚焦又会弹起。因此工具按钮在
  mousedown 时阻止取焦点；工具栏按下时记录编辑区是否有焦点，菜单关闭后据此还给编辑区；桌面上命令后总是
  回到编辑区，但不会把焦点从查找面板等编辑器自己的面板里抢走。菜单不设为 modal，避免锁定页面滚动造成布局移动；
  非全屏时不再跟随 visualViewport 滚动编辑区。
- **选区始终可见。** CodeMirror 的选区层画在行背景下面，所以当前行、复制高亮都用半透明颜色。

## 交互

- 宽屏（≥1280px）：代码右侧是“大纲 / 预览 / 问题”侧栏，可用“结构”按钮收起；窄屏改为底部面板。
- 大纲随光标高亮当前所在的 Task / Event / 循环，点击跳转；Event 旁显示循环展开后的 Act 数。
- 预览按循环展开后的结果列出每个 Event 的 Act，光标所在 Event 排在最前；状态栏显示 Event 与 Act 总数。
- 循环菜单：数字循环、列表循环、章节 × 小节三种模板，按光标所在层级（Run / Task / Event 队列）生成。
- 复制、删除、复制一份：有选区处理选区；无选区处理当前行；光标在结构括号上处理整块。选择块逐层扩大选区。
- “起始页”菜单把光标所在 Task 的 `@let start_url=` 设为选中的快捷链接（没有就插入）；
  当前地址不在列表里时可直接“添加到快捷链接”。
- 保存或运行时如有 DSL 错误，不会写入后端，编辑器选中第一个错误（宽屏同时打开问题列表）。
- 快捷键：`Ctrl/⌘ S` 保存、`Ctrl/⌘ F` 查找替换、`Shift Alt F` 格式化、`Ctrl/⌘ Shift D` 复制一份、
  `Ctrl/⌘ I` 选择块、`Ctrl Space` 补全；完整列表见“设置 → 快捷键”。

## 快捷链接

`lib/domain/start-links.ts` 定义模型、默认值与校验，`lib/api/user-preferences.ts` 读写
PocketBase `aw_user_preferences`（每个账号一条记录，仅属主可读写，迁移在 workers 仓库）。
`features/start-links` 的 store 按账号隔离，先显示本机缓存再同步；未保存过时使用默认的五个页面。

它和运行配置的页面列表（`lib/domain/runtime-pages.ts`）是两回事：后者是 `pageOverrides` 的后端契约，固定不可编辑。
