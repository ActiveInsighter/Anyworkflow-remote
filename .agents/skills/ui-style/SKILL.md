---
name: ui-style
description: Project-specific UI style contract for AnyWorkflow Remote. Synthesize UI/UX Pro Max, Anthropic Frontend Design, Tailwind Theme Builder, Vercel Web Interface Guidelines, and the repository's shadcn responsive rules when designing or changing React UI.
---

# AnyWorkflow Remote UI Style

Use this skill for any change that affects pages, components, layout, typography, colors, interaction, accessibility, responsive behavior, or visual polish.

## Product and stack context

- Product: a responsive web control surface for automation workflows, Runs, Tasks, and Events.
- Stack: React 19, Vite 8, TypeScript, Tailwind CSS 4, shadcn/ui with Radix primitives, and Lucide icons.
- Existing project rules: read the root `AGENTS.md` and the relevant skills under `.agents/skills/` before editing.
- Preserve the current pure-black dark foundation and semantic CSS-variable theme unless the user explicitly requests a visual direction change.

## Design direction

Treat the interface as a calm, high-signal operator console. Prioritize scanability, clear status, predictable actions, and confidence during long-running work.

- Establish hierarchy through spacing, type scale, alignment, and semantic color before adding decoration.
- Keep copy in sentence case, concrete, and action-oriented. Use the same verb for an action and its resulting feedback.
- Give each view one clear focal point; avoid generic SaaS card grids, ornamental gradients, excessive rounded containers, and decorative labels.
- Use a deliberate visual choice tied to workflow operations, while keeping secondary surfaces quiet and consistent.
- Use Lucide SVG icons with accessible labels; never use emoji or Unicode symbols as product/navigation icons.

## Theme and Tailwind rules

- Use semantic tokens such as `bg-background`, `text-foreground`, `bg-primary`, and `text-muted-foreground`; do not hardcode colors in components.
- Keep theme values in the existing global stylesheet and map them through Tailwind v4 `@theme inline`. Do not create a second theme file.
- Keep `:root` and `.dark` at stylesheet root level, not inside `@layer base`; avoid double `hsl()` wrapping.
- Prefer existing shadcn primitives in `src/components/ui/`. Use `cn()` from `@/lib/utils` for conditional classes.
- Use `gap-*` for layout, `size-*` for equal dimensions, and component variants before writing new CSS.
- Do not add manual `dark:` color overrides when semantic tokens already express the theme.

## Interaction and accessibility contract

- Use real buttons and links with visible keyboard focus; icon-only controls need an accessible name.
- Inputs need visible labels and errors next to the relevant field. Dialogs, sheets, and drawers need accessible titles.
- Keep practical touch targets near 44px and provide loading feedback for actions that take time.
- Status must not rely on color alone: pair color with text or an equivalent accessible cue. Use `role="status"` for loading and `role="alert"` for errors where appropriate.
- Maintain readable contrast: 4.5:1 for normal text and 3:1 for large text and UI boundaries.
- Respect `prefers-reduced-motion`; animate meaningfully and avoid layout-thrashing width/height animations.

## Responsive behavior

- Design mobile-first and verify both desktop and widths at or below 760px.
- At 320px, avoid horizontal overflow, clipped controls, and hidden critical actions.
- Keep primary actions reachable one-handed on mobile and account for safe-area insets for fixed or sticky controls.
- Preserve useful desktop navigation without duplicating mobile-only business logic.

## Performance guardrails

- Follow `.agents/skills/vercel-react-best-practices` for React and data-flow changes, especially avoiding waterfalls, unnecessary client bundles, and avoidable re-renders.
- Do not define components inside components or create unstable external-store snapshots.
- Reserve space for async content, lazy-load heavy non-critical UI, and keep motion on compositor-friendly properties.

## Working sequence

1. Inspect the existing page, tokens, primitives, and responsive behavior before proposing a new pattern.
2. For a new visual direction, query `.agents/skills/ui-ux-pro-max/scripts/search.py` with the detected stack and a focused product query; do not persist an unverified result.
3. Make the smallest coherent token/component change that satisfies the brief.
4. Review against `.agents/skills/web-design-guidelines`, `.agents/skills/frontend-design`, and the project `shadcn-responsive-ui` rules.
5. Run `npm run preflight` before declaring a UI change complete.

## Final review checklist

- [ ] Existing primitives and semantic tokens are reused.
- [ ] Desktop and <=760px layouts are both usable; no 320px horizontal overflow.
- [ ] Focus, labels, names, contrast, status text, and reduced motion are handled.
- [ ] Copy is concise, consistent, and describes user actions rather than implementation details.
- [ ] No emoji icons, arbitrary raw colors, placeholder-only labels, or decorative motion slipped in.
- [ ] `npm run preflight` passes.
