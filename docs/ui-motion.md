# UI 动效

参照 exam-docs，使用 Animate UI 2.x 与 Motion。业务代码继续复用 `@/components/ui/*`，
保留现有 Radix / Base UI 组合 API、主题和响应式布局。

| 入口 | 职责 |
| --- | --- |
| `src/app/providers.tsx` | `AnimateUIProvider tempo={0.85} reducedMotion="user"` 与 `ReducedMotionConfig`，统一节奏并跟随系统减少动态效果。 |
| `src/components/ui/button.tsx` | 官方 Button primitive 的按压反馈，保留 `asChild`、ref 和现有变体。 |
| `dialog.tsx` / `alert-dialog.tsx` / `sheet.tsx` | Animate UI Radix Dialog / AlertDialog，保留焦点、键盘与关闭语义；Sheet 用 `data-side` 指定滑入方向。 |
| `dropdown-menu.tsx` / `popover.tsx` / `tooltip.tsx` | 官方浮层的开合、定位和焦点。 |
| `checkbox.tsx` / `switch.tsx` / `toggle*.tsx` / `tabs.tsx` / `progress.tsx` / `collapsible.tsx` | 官方选择反馈、切换、进度和展开收起。 |
| `modal.tsx` | 从 exam-docs 同步的 Animate UI Base UI Drawer 组合：底部面板、顶栏、正文与分栏。 |
| `modal-navigation.tsx` | 嵌套 Modal 在同一个 Drawer 内以官方 Tabs.Panel 切页；被覆盖页保留状态并隔离焦点。 |
| `src/components/animate-ui/icons/` | 同步自 exam-docs 的返回、关闭图标。 |

Modal 由唯一 Drawer 负责拖拽关闭、滚动锁定和焦点陷阱。Esc / 遮罩在子页先返回，
关闭按钮 / 拖拽关闭整个面板；关闭时重置子页状态，退场期间冻结可见页面，避免露出父页。
正文保持原生滚动，顶栏占独立空间，不测量大面积滚动区，不采样实时背景模糊。
样式复用 Remote 的语义色彩、层级和 `src/styles/tokens/modal.css`。

通用原语由官方 CLI 迁移：`npx @animate-ui/cli@latest animate all`。
不要在这些原语上叠加旧的 `animate-in/out`、`animate-disclosure` 或手写拖拽逻辑。
不涉及动画的 Input、Field、Label、Avatar、Badge、Separator 保留原实现。
工作状态轨道和记录入场仍使用 `tokens/motion.css`，通过 CSS 媒体查询减少动态效果。
自定义 Motion 动画使用 `@animate-ui/react/utils/motion` 令牌及 `useTempoTransition()`。

验证：`npm run preflight` 与 `npm run test:browser`。检查 320px、390px、760px 和桌面，
亮 / 暗色、减少动态效果、动画中间帧、快速开关、嵌套返回和关闭后的焦点恢复。
