# AnyWorkflow Remote agent guide

This repository is the responsive web control surface for AnyWorkflow. These rules apply whether the agent is working from a local Git checkout or from the CI-generated source artifact.

## Start here

Read only the minimum context needed before editing:

1. Read this `AGENTS.md`.
2. Read `package.json` and the skill(s) relevant to the task.
3. Inspect the specific page, component, API module, workflow, or configuration being changed.
4. Search the repository for affected symbols/usages before making cross-cutting changes.
5. Do not crawl every file up front when targeted inspection is enough.

The project skills live under `.agents/skills/`. Treat them as repository-local instructions and prefer them over generic assumptions.

## Environment-aware workflow

### Local Git checkout

When `.git/` is available:

- Check the current branch and working tree before editing.
- Preserve unrelated user changes; never reset, clean, or overwrite them just to simplify the task.
- Use Git history/diff when it helps explain an existing implementation.
- Install dependencies with `npm install` when needed. This repository intentionally does not require a lockfile.
- Before finishing code changes, run `npm run preflight`.

### CI / cloud source artifact

The `anyworkflow-remote-ai-context` artifact contains a tested source snapshot created from the exact commit that passed `web-ci`.

When working from that artifact:

- Treat the extracted `Anyworkflow-remote/` directory as the repository root.
- A missing `.git/` directory is expected; do not assume the source is incomplete because Git metadata is absent.
- Read this file first, then load only the task-relevant skills from `.agents/skills/`.
- Do not spend connector calls re-reading files that are already present in the extracted artifact.
- The artifact excludes `node_modules/` and `dist/`; run `npm install` before local verification when dependencies are not already available.
- Use the commit SHA encoded in the inner ZIP filename as the source snapshot identity.
- If the task requires newer code than the extracted SHA, fetch a newer successful artifact rather than mixing files from multiple commits.

## Skill routing

Use the smallest set of skills that fully covers the task.

- Any UI, page, component, layout, typography, color, responsive, accessibility, or visual-polish work: start with `ui-style`.
- PocketBase, backend/API, Run/Task/Event, queue semantics, or DSL changes: `anyworkflow-contract`.
- Fixes, refactors, release readiness, state-management correctness, type checking, and build validation: `frontend-quality-gate`.
- Cloudflare Workers Static Assets, deployment, or GitHub Actions changes: `cloudflare-workers-assets`.
- Direct shadcn/ui primitive or responsive-component implementation: `shadcn-responsive-ui` in addition to `ui-style` when useful.

### UI skill composition

`ui-style` is the project UI entry point. It consolidates the local project rules and may call on these bundled reference skills when relevant:

- `ui-ux-pro-max` for design-system exploration and product-specific UI patterns.
- `frontend-design` for visual hierarchy, composition, and non-generic interface design.
- `tailwind-theme-builder` for Tailwind CSS 4 and shadcn theme/token work.
- `web-design-guidelines` for final interface review. Some checks may require network access to retrieve the upstream guideline source.
- `shadcn-responsive-ui` for project-specific component, accessibility, and responsive implementation rules.

Do not apply every UI skill mechanically. Use `ui-style` first, then consult the supporting skill that addresses the actual change.

## Non-negotiable project constraints

- Keep backend collection names and command semantics compatible with Anyworkflow-wechat unless the user explicitly requests a backend migration.
- Use shadcn/ui primitives from `src/components/ui/` before creating a new primitive.
- Use Lucide icons instead of emoji or Unicode symbol icons in product UI.
- Desktop and mobile are both first-class. Verify desktop and widths at or below 760px; avoid horizontal overflow at 320px.
- Use semantic CSS variables/theme tokens instead of hardcoded component colors unless the task explicitly requires a new token.
- Never read a React external-store snapshot by parsing storage into a new object on every `getSnapshot` call.
- Do not introduce a second source of truth for Run/Task/Event state or command semantics.
- Keep user-facing copy concise and remove implementation-detail prose from product UI unless it is necessary for operation.
- Run `npm run preflight` before treating a code change as complete.
- Do not claim Cloudflare deployment success until the relevant deploy workflow is actually green.

## Change discipline

- Prefer the smallest coherent change that solves the root problem.
- Reuse existing components, hooks, utilities, tokens, and data contracts before adding new abstractions.
- When changing a shared primitive or contract, inspect all repository usages first.
- Do not mix unrelated cleanup into a focused task unless the cleanup is required for correctness.
- Keep source files UTF-8 and use LF line endings.
- Never commit secrets, local environment values, generated `dist/`, or `node_modules/`.

## Verification

For code changes, the default completion gate is:

```bash
npm run preflight
```

For CI/deployment changes, also inspect the resulting GitHub Actions run.

For UI work, verify both desktop and mobile behavior and review the final implementation against `ui-style`.

For backend/contract work, verify compatibility with `anyworkflow-contract` and existing Anyworkflow-wechat semantics.

A task is not complete merely because files were edited; the relevant validation must pass or any validation limitation must be stated explicitly.
