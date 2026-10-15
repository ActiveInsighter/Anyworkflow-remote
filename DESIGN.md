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
| Canvas | `#ffffff` | `#101114` |
| Sidebar | `#f7f7f8` | `#0c0d10` |
| Panel | `#ffffff` | `#141519` |
| Primary text | `#202127` | `#edeef2` |
| Secondary text | `#666973` | `#9699a6` |
| Primary action | `#5e6ad2` | `#5e6ad2` |
| Decorative divider | `#e8e8ed` | `#272830` |

All values live in `src/styles.css`, mapped through Tailwind v4 `@theme inline`.
Use semantic utility classes in components. Indigo is reserved for primary actions,
brand, selection emphasis, and focus. Success, warning, and failure have their own
semantic colors and readable text labels. Decorative dividers are intentionally subtle;
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

- Desktop: 240px collapsible sidebar, 56px top bar, content up to 1440px wide.
- Keep the workspace navigation quiet; use one clear primary action for each task.
- Workflow lists use aligned status, task progress, and update columns on large screens.
  At narrower widths, the same records reflow into readable rows with visible actions.
- Detail views use a summary surface followed by expandable execution records.
- The editor fills available height; only CodeMirror scrolls inside its workspace.
- Use a 4px spacing rhythm. Controls use modest 5–8px radii; avoid nested cards.
- Prefer thin dividers and surface changes over shadows. Reserve pronounced elevation
  for floating overlays. No decorative gradients, glow effects, or large dashboard stats.

## Interaction and verification

- Preserve existing navigation, API calls, Run commands, and draft behavior.
- Keep light, dark, and system preferences; theme and editor must change together.
- Real links/buttons, visible keyboard focus, named icon controls, and labeled statuses.
- Keep practical touch targets around 44px, drawer navigation, safe-area handling,
  and no horizontal overflow at 320px. Do not shrink mobile UI to desktop density.
- Respect reduced motion. Normal text contrast must be at least 4.5:1.
- Run `npm run preflight` and relevant existing browser regressions before deployment.
- Verify desktop/mobile screenshots in both themes using isolated fixture data.
