# AnyWorkflow Remote design

Remote is one person's control room for long-running work: workflows, PDF conversions and page
captures. It has three jobs: start work in a second, show what is moving, hand back the result.
Everything below serves those three.

## Direction: 天青

- **Colour means something.** The chrome is quiet ink on cool paper. The one accent means action
  or live work, so a screen's colour points at what needs attention.
- **One raised surface.** A tool page has a single raised element, the composer, where new work
  starts. Records sit flat on the page.
- **Progress in real units.** Rails count phases or Tasks that exist. Nothing shows a percentage
  nobody measured.
- **One action per record.** A row shows the action its state puts first. The rest are in its menu.

## Color

Every neutral leans toward the brand hue, so surfaces and the accent always agree.

| Role | Light | Dark |
| --- | --- | --- |
| Canvas (app frame, sidebar) | `#ebf0f1` | `#0b1215` |
| Page panel | `#fdfefe` | `#10191d` |
| Card | `#ffffff` | `#142024` |
| Subtle band (hover, wells) | `#f4f7f8` | `#152226` |
| Primary text | `#14222a` | `#e4ecee` |
| Secondary text | `#55676f` | `#93a6ae` |
| Primary action and live work | `#0a6c7c` | `#38b6c9` |
| Decorative divider | `#e2e8ea` | `#202e34` |

All values live in `src/styles/tokens/`, one file per concern, and are mapped to
Tailwind utilities in `src/styles/theme.css`:

| File | Owns |
| --- | --- |
| `color.css` | Light/dark palettes, semantic status colors, sidebar and editor colors |
| `typography.css` | Font families and the type scale (`text-micro` … `text-display`) |
| `shape.css` | Radii |
| `layout.css` | Touch target, header height, content widths, sidebar widths |
| `elevation.css` | Shadows (`shadow-xs…lg`, `shadow-panel`, `shadow-raised`) and stacking layers (`z-raised`, `z-chrome`, `z-overlay`) |
| `motion.css` | Durations (`duration-fast/base/slow`), easing, rails, indeterminate progress, reduced-motion handling |
| `modal.css` | Modal sheet surface, glass controls, radius and curves (shared by Radix dialogs) |

Use semantic utility classes in components. The accent is reserved for primary actions, live work,
selection and focus; one solid button per view. Success sits on the yellow side of green so it never
reads as the accent. Async task status follows one mapping for every kind
(`src/lib/tasks/status.ts`): queued grey, running accent, succeeded green, partial and stopping amber,
failed red, canceled and expired grey. Decorative dividers are intentionally subtle; inputs and focus
indicators use stronger tokens. Text pairs meet 4.5:1 and control boundaries 3:1 in both themes.

## Typography

- Geist for Latin UI text; system Chinese faces after it, in the order set in `typography.css`.
- Geist Mono only for code, selectors and raw links. Metadata stays in the sans with
  `tabular-nums`: mono next to hanzi reads as a different voice.
- Fonts are self-hosted in `public/fonts/`, from the `geist` 1.7.2 package.
  The SIL Open Font License is retained alongside them.
- Hanzi are dense, so nothing a person reads goes below 12px: main UI 14px, metadata 12px, counters
  inside controls 11px. Page titles are 22–26px, weight 600.
- Keep tracking near zero on headings: negative spacing crowds hanzi. `text-autospace` sets the gap
  between hanzi and Latin; do not type spaces for it.
- Use sentence case and concise Chinese action labels. Avoid ornamental labels.

## Layout and surfaces

- Desktop: 240px collapsible sidebar on the canvas; the page sits on an inset panel
  (8px margin, 16px radius, `shadow-panel`). Lists use up to 1440px; a composer over its records,
  and settings, use the 960px `focus` measure.
- The top bar carries a trail only below the top level. A top-level page names itself in its
  heading, so its bar holds just the task center, with no back button.
- Navigation is grouped (工作 / 资源 / 工具) with settings and the account at the bottom.
  Items show the number of running tasks of their kind. The current page is tinted; the raised
  surface in the sidebar is kept for 新建工作流, which never outranks the page's own action.
- Records (`JobRow`, the Run list, the drive) sit on the page without a frame: a state mark, the name,
  a line of facts, one action, a menu. Hover tints the row.
- Workflow lists align status, task progress and update time into columns on large screens.
  At narrower widths the same records reflow into readable rows with visible actions.
- Detail views use a summary surface followed by expandable execution records.
- The editor fills available height; only CodeMirror scrolls inside its workspace.
- Use a 4px spacing rhythm. Radius grows with size: controls 8px, cards 12px, the composer 16px,
  sheets 20px. Pills are for avatars and counters only. Avoid nested cards.
- Cards are flat with a hairline border; reserve them for groups that need a frame. Pronounced
  elevation is for the composer and floating overlays. No decorative glow, gradients or large
  dashboard stats.
- Overlays are one family: the Modal (bottom sheet on phones, floating panel on wide
  screens, frosted header controls) for forms and panels; Radix dialogs share its look.

## Components

- `SegmentRail`: one segment per real unit. `live` makes the first unfinished segment breathe, the
  only motion that means work is happening. `TaskProgress` picks the truest terms a kind offers:
  measured percent, then phases (`taskPhase`), then a sweep.
- `Composer`: the raised form on a tool page. Keep the action in view without scrolling; fold what
  is rarely set. Folded fields stay mounted and still apply, and the fold shows how many are set.
  An accepted submission clears it. A source should be enough: derive the name, default the rest.
- `JobRow` / `JobMenu`: the row and overflow menu for any async job. Add a new kind of job with
  these rather than a new row.

## Interaction and verification

- Preserve existing navigation, API calls, Run commands, and draft behavior.
- Keep light, dark, and system preferences; theme and editor must change together.
- Real links/buttons, visible keyboard focus, named icon controls, and labeled statuses.
- Keep practical touch targets around 44px, drawer navigation, safe-area handling,
  and no horizontal overflow at 320px. Do not shrink mobile UI to desktop density.
- Respect reduced motion. Normal text contrast must be at least 4.5:1.
- Captured pages are untrusted: render them as text through `src/lib/markdown-blocks.ts`, never as markup, and
  never load their images.
- Run `npm run preflight` and relevant existing browser regressions before deployment.
- Verify desktop/mobile screenshots in both themes using isolated fixture data.
