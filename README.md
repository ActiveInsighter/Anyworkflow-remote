# AnyWorkflow Remote

AnyWorkflow 的响应式 Web 控制端。项目参考 `Anyworkflow-wechat` 的产品模型与 PocketBase 接口，但前端按桌面浏览器和手机浏览器重新设计，不复用小程序页面结构。

## 技术栈

- React 19.3
- Vite 8.3
- TypeScript 7
- React Router 8
- Tailwind CSS 4.3（作为样式基础，当前 UI 主要使用语义化类和 CSS 变量）
- PocketBase HTTP API

## 已实现

- PocketBase 登录、退出与地址配置
- Run 列表与状态筛选
- Run 新建、草稿编辑、发布、复制、重跑、删除
- Run 暂停、继续、取消命令
- Run / Task / Event 详情
- Event 队列解析、复制和运行时状态展示
- 进行中数据自动轮询刷新
- 桌面侧栏布局
- 手机底部导航与触控优化
- 自动深色模式
- Web App manifest
- GitHub Actions 类型检查与构建

## 后端兼容

后端协议保持与小程序一致：

- `aw_clients`
- `aw_dispatch_runs`
- `aw_dispatch_tasks`
- `aw_dispatch_events`

Run 控制仍使用 `requestedAction + commandVersion + 1`。Run DSL 仍写入 `planText`，云端继续负责 Task/Event 展开。

## 本地开发

```bash
npm install
npm run dev
```

默认 PocketBase 地址为：

```text
https://pb.any1.tech
```

也可复制 `.env.example` 并设置：

```bash
VITE_POCKETBASE_URL=https://pb.any1.tech
```

## 构建

```bash
npm run typecheck
npm run build
```

静态产物位于 `dist/`，可部署到 Cloudflare Pages、EdgeOne Pages、Vercel 或任意静态站点服务。
