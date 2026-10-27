# AnyWorkflow Remote design

Remote is a workspace for composing workflows and following Run → Task → Event execution.
Make active work, errors, and the next useful action easy to find.

## References

- Primary: Linear, adapted from the `awesome-design-md` skill's `linear.app/DESIGN.md`.
  Borrow its quiet surfaces, compact navigation, list rhythm, and restrained indigo accent.
- Secondary: Vercel, adapted from the skill's `vercel/DESIGN.md` and
  [Geist](https://vercel.com/geist/introduction).
  Borrow precise technical typography, aligned metadata, and clear component states.
- These are product-console adaptations. Marketing-page hero sizes, gradients, screenshots,
  pricing layouts, and brand assets are not part of this application's design.

## Color

| Role | Light | Dark |
| --- | --- | --- |
| Canvas (app frame, sidebar) | `#f3f3f6` | `#09090c` |
| Page panel | `#ffffff` | `#111116` |
| Card | `#ffffff` | `#141419` |
| Subtle band (headers, wells) | `#f8f8fa` | `#16161c` |
| Primary text | `#1b1c22` | `#ececf1` |
| Secondary text | `#646773` | `#9a9cab` |
| Primary action | `#5b5bd6` | `#5b5bd6` |
| Decorative divider | `#e6e6eb` | `#25252d` |

All values live in `src/styles/tokens/`, one file per concern, and are mapped to
Tailwind utilities in `src/styles/theme.css`:

| File | Owns |
| --- | --- |
| `color.css` | Light/dark palettes, semantic status colors, sidebar and editor colors |
| `typography.css` | Font families and the type scale (`text-micro` … `text-display`) |
| `shape.css` | Radii |
| `layout.css` | Touch target, header height, content widths, sidebar widths |
| `elevation.css` | Shadows (`shadow-xs…lg`, `shadow-panel`) and stacking layers (`z-raised`, `z-chrome`, `z-overlay`) |
| `motion.css` | Durations (`duration-fast/base/slow`), easing, indeterminate progress, reduced-motion handling |
| `modal.css` | Modal sheet surface, glass controls, radius and curves (shared by Radix dialogs) |

Use semantic utility classes in components. Indigo is reserved for primary actions,
brand, selection emphasis, and focus. Success, warning, and failure have their own
semantic colors and readable text labels. Async task status follows one mapping for
every kind (`src/lib/tasks/status.ts`): queued grey, running blue, succeeded green,
partial and stopping amber, failed red, canceled and expired grey. Decorative dividers are intentionally subtle;
inputs and focus indicators use stronger tokens.

## Typography

- Geist for Latin UI text; system Chinese sans-serif fallbacks for Chinese text.
- Geist Mono for code, IDs, versions, percentages, and compact numerical metadata.
- Fonts are self-hosted in `public/fonts/`, from the `geist` 1.7.2 package.
  The SIL Open Font License is retained alongside them.
- Page titles: 23–28px, weight 600, tight tracking.
- Main UI: 13–14px; secondary metadata: 11–12px. Code: 14px with 1.8 line height.
- Use sentence case and concise Chinese action labels. Avoid ornamental labels.

## Layout and surfaces

- Desktop: 240px collapsible sidebar on the canvas; the page sits on an inset panel
  (8px margin, 16px radius, `shadow-panel`) with a 56px top bar holding the breadcrumb
  and the task center. Content up to 1440px wide.
- Navigation is grouped (工作 / 资源 / 工具) with settings and the account at the bottom.
  Items show the number of running tasks of their kind.
- Keep the workspace navigation quiet; use one clear primary action for each task.
- Workflow lists use aligned status, task progress, and update columns on large screens.
  At narrower widths, the same records reflow into readable rows with visible actions.
- Detail views use a summary surface followed by expandable execution records.
- The editor fills available height; only CodeMirror scrolls inside its workspace.
- Use a 4px spacing rhythm. Controls use 7–10px radii, cards 14px, sheets 24px; status
  badges are pills. Avoid nested cards.
- Cards carry a hairline border and the faintest shadow; structure inside comes from
  dividers. Reserve pronounced elevation for floating overlays. No decorative glow or
  large dashboard stats.
- Overlays are one family: the Modal (bottom sheet on phones, floating panel on wide
  screens, frosted header controls) for forms and panels; Radix dialogs share its look.

## Interaction and verification

- Preserve existing navigation, API calls, Run commands, and draft behavior.
- Keep light, dark, and system preferences; theme and editor must change together.
- Real links/buttons, visible keyboard focus, named icon controls, and labeled statuses.
- Keep practical touch targets around 44px, drawer navigation, safe-area handling,
  and no horizontal overflow at 320px. Do not shrink mobile UI to desktop density.
- Respect reduced motion. Normal text contrast must be at least 4.5:1.
- Run `npm run preflight` and relevant existing browser regressions before deployment.
- Verify desktop/mobile screenshots in both themes using isolated fixture data.
