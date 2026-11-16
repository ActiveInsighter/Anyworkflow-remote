# The website HomeDemo, installed with official setup

This route uses the **actual assistant-ui.com homepage demo**, from
`apps/docs/components/pages/home/demo`, rather than the default starter's layout.

Source: https://github.com/assistant-ui/assistant-ui/tree/294e932dbb073b75ebc3c24540f98909a64f18c9/apps/docs/components/pages/home/demo

Setup followed the official `npx assistant-ui@latest setup` guide, approved for
the existing Vite app and PocketBase backend. Prerequisites were installed with:

```sh
npx assistant-ui@latest add thread thread-list model-selector quote directive-text composer-trigger-popover context-display message-timing --yes --overwrite
npx assistant-ui@latest doctor
```

The elements use the official Base UI variant (`base-nova`), as does the website.
They remain isolated from the other app's primitives. The CLI performs its own
Base UI `render` transformations. `upstream.json` records installed hashes,
registry origins, source comparisons and integration changes.

The HomeDemo shell, message layout, composer, action bar, suggestion chips,
reasoning disclosure, sidebar, fullscreen handling and tool JSON panels are
copied from the website. Original style literals are retained; the favicon's
asset path is namespaced. The theme uses the website's sand colors and its
Public Sans / JetBrains Mono fonts, scoped to the Gemini route. Its source and
font licenses are included alongside the distributed assets.

Only app integration replaces website services: model/effort preferences,
account controls, token usage, public response data, feedback persistence,
regeneration/editing, configuration and segment menus. Website quota gating,
login and memory endpoints are not called. App-provided follow-up shortcuts
use the original FollowUps component. No call goes to the website's model API.

Public tools execute on the existing backend; replaying saved response data
cannot run a browser tool. Unlinked results/artifacts are shown using the same
ToolTraceCard without inventing an association. The MIT license is in `LICENSE`.
