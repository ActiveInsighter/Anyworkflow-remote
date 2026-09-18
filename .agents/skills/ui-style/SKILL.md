---
name: ui-style
description: Project-specific UI style contract for AnyWorkflow Remote. Synthesize UI/UX Pro Max, Anthropic Frontend Design, Tailwind Theme Builder, Vercel Web Interface Guidelines, and the repository's shadcn responsive rules when designing or changing React UI.
---

# AnyWorkflow Remote UI Style

Use this skill for any change that affects pages, components, layout, typography, colors, interaction, accessibility, responsive behavior, or visual polish. This is the primary UI entry point for both local and cloud agents.

## Context loading

Read the root `AGENTS.md` first. Then inspect the existing page/component and its nearby primitives before consulting additional UI reference skills.

Do not load every UI skill by default. Use the supporting skill that matches the task:

- `shadcn-responsive-ui`: project-specific shadcn primitives, responsive behavior, accessibility, and component implementation.
- `ui-ux-pro-max`: design-system exploration, product patterns, and focused design research.
- `frontend-design`: visual hierarchy, composition, typography, and avoiding generic generated-looking UI.
- `tailwind-theme-builder`: Tailwind CSS 4, semantic theme variables, dark mode, and shadcn token work.
- `web-design-guidelines`: final interface review; some upstream guideline retrieval may require network access.

All of these skills are bundled under `.agents/skills/` in the CI source artifact except any explicitly network-fetched upstream reference material.

## Product and stack context

- Product: a responsive web control surface for automation workflows, Runs, Tasks, and Events.
- Stack: React 19, Vite 8, TypeScript, Tailwind CSS 4, shadcn/ui with Radix primitives, and Lucide icons.
- Preserve the current pure-black dark foundation and semantic CSS-variable theme unless the user explicitly requests a visual direction change.
- Desktop and mobile are equal product surfaces, not a desktop UI with a minimal mobile fallback.

## Design direction

Treat the interface as a calm, high-signal operator console. Prioritize scanability, clear status, predictable actions, and confidence during long-running work.

- Establish hierarchy through spacing, type scale, alignment, and semantic color before adding decoration.
- Keep copy in sentence case, concrete, and action-oriented. Use the same verb for an action and its resulting feedback.
- Give each view one clear focal point; avoid generic SaaS card grids, ornamental gradients, excessive rounded containers, and decorative labels.
- Prefer flat, intentional composition over nested cards when spacing and separators can express structure more clearly.
- Use a deliberate visual choice tied to workflow operations while keeping secondary surfaces quiet and consistent.
- Use Lucide SVG icons with accessible labels; never use emoji or Unicode symbols as product/navigation icons.
- Remove descriptive or explanatory UI prose when the interface is already self-explanatory.

## Theme and Tailwind rules

- Use semantic tokens such as `bg-background`, `text-foreground`, `bg-primary`, and `text-muted-foreground`; do not hardcode colors in components.
- Keep theme values in the existing global stylesheet and map them through Tailwind v4 `@theme inline`. Do not create a second theme file.
- Keep `:root` and `.dark` at stylesheet root level, not inside `@layer base`; avoid double `hsl()` wrapping.
- Prefer existing shadcn primitives in `src/components/ui/`. Use `cn()` from `@/lib/utils` for conditional classes.
- Use `gap-*` for layout, `size-*` for equal dimensions, and component variants before writing new CSS.
- Do not add manual `dark:` color overrides when semantic tokens already express the theme.
- Keep radius, border, muted-surface, and elevation choices consistent across related controls.

## Interaction and accessibility contract

- Use real buttons and links with visible keyboard focus; icon-only controls need an accessible name.
- Inputs need visible labels and errors next to the relevant field. Dialogs, sheets, and drawers need accessible titles.
- Keep practical touch targets near 44px and provide loading feedback for actions that take time.
- Status must not rely on color alone: pair color with text or an equivalent accessible cue. Use `role="status"` for loading and `role="alert"` for errors where appropriate.
- Maintain readable contrast: 4.5:1 for normal text and 3:1 for large text and UI boundaries.
- Respect `prefers-reduced-motion`; animate meaningfully and avoid layout-thrashing width/height animations.
- Preserve keyboard navigation and focus order when rearranging responsive layouts.

## Responsive behavior

- Design mobile-first and verify both desktop and widths at or below 760px.
- At 320px, avoid horizontal overflow, clipped controls, hidden critical actions, and accidental page scrollbars.
- Keep primary actions reachable one-handed on mobile and account for safe-area insets for fixed or sticky controls.
- Preserve useful desktop navigation without duplicating mobile-only business logic.
- When replacing desktop navigation on mobile, keep actions discoverable rather than simply hiding them.

## React and performance guardrails

These rules are self-contained so the skill works identically in local checkouts and offline cloud artifacts:

- Avoid request waterfalls when independent data can load concurrently.
- Avoid unnecessary client state, effects, and re-renders; derive values during render when possible.
- Do not define React components inside other components.
- Keep external-store snapshots referentially stable; never parse storage into a fresh object on every `getSnapshot`.
- Memoization should solve a measured or structurally clear stability problem, not be applied mechanically.
- Lazy-load heavy non-critical UI and reserve space for asynchronous content to avoid layout shifts.
- Keep motion on compositor-friendly properties such as transform and opacity when practical.
- Avoid adding large dependencies for behavior that existing project utilities or primitives already cover.

## Working sequence

1. Read root `AGENTS.md` and inspect the current implementation.
2. Identify whether the task is primarily layout, theme, component behavior, accessibility, or visual-direction work.
3. Consult only the supporting UI skill(s) needed for that category.
4. For a genuinely new visual direction, optionally query `.agents/skills/ui-ux-pro-max/scripts/search.py` with a focused product/stack query. Treat its result as design input, not an instruction to overwrite the existing system.
5. Make the smallest coherent token/component/layout change that solves the root issue.
6. Search usages before changing shared primitives or theme tokens.
7. Review against project responsiveness/accessibility rules and, when useful, `web-design-guidelines` / `frontend-design`.
8. Run `npm run preflight` before declaring the UI change complete.

## Final review checklist

- [ ] Existing primitives and semantic tokens are reused where appropriate.
- [ ] Desktop and <=760px layouts are both usable; no 320px horizontal overflow.
- [ ] Focus, labels, names, contrast, status text, and reduced motion are handled.
- [ ] Copy is concise, consistent, and describes user actions rather than implementation details.
- [ ] No emoji icons, arbitrary raw colors, placeholder-only labels, unnecessary gradients, or decorative motion slipped in.
- [ ] Shared primitive/token changes were checked at all relevant usages.
- [ ] `npm run preflight` passes.
