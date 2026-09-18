---
name: shadcn-responsive-ui
description: Build or refactor AnyWorkflow Remote UI with shadcn/ui, Tailwind CSS 4, Lucide icons, accessible interactions, and equal-quality desktop/mobile behavior.
---

# shadcn responsive UI

Use this skill for pages, components, navigation, forms, dialogs, status surfaces, empty states, and responsive layout work.

## Component rules

1. Prefer existing shadcn primitives in `src/components/ui/`.
2. If a primitive is missing, add it in shadcn style and keep it reusable; do not bury a generic Button/Input/Dialog inside a page.
3. Project-specific composed UI may live in `src/components/` or the page.
4. Use `cn()` from `@/lib/utils` for class composition.
5. Use Lucide icons. Do not use emoji or Unicode symbols as navigation/product icons.
6. Keep visual state in semantic variables. Preserve the pure-black dark background.
7. Avoid duplicating shadcn primitive CSS in `styles.css`; legacy layout CSS may remain until migrated.

## Responsive rules

- Desktop sidebar remains usable at wide widths.
- At <= 760px, primary actions must stay reachable with one hand and respect safe-area insets.
- Touch targets should be about 44px where practical.
- No horizontal overflow at 320px.
- Sticky/fixed controls must not cover editor content or bottom navigation.
- Do not hide critical actions only on mobile.

## Accessibility

- Interactive controls must be real buttons/links.
- Preserve visible keyboard focus.
- Inputs need labels.
- Status-only color must also have text.
- Loading states use `role="status"`; errors use `role="alert"`.
