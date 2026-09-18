# AnyWorkflow Remote agent guide

This repository is the responsive web control surface for AnyWorkflow.

## Before editing

Use the matching repository skill under `.agents/skills/`:
- backend/API, Run/Task/Event, PocketBase changes: `anyworkflow-contract`
- React UI, responsive behavior, shadcn/ui: `shadcn-responsive-ui`
- fixes/refactors/releases: `frontend-quality-gate`
- Workers Static Assets/GitHub Actions: `cloudflare-workers-assets`

## Non-negotiable constraints

- Keep backend collection names and command semantics compatible with Anyworkflow-wechat unless the user explicitly requests a backend migration.
- Use shadcn/ui primitives from `src/components/ui/` before creating a new primitive.
- Use Lucide icons instead of emoji/symbol icons in product UI.
- Desktop and mobile are both first-class. Test layouts at <= 760px and desktop widths.
- Never read a React external-store snapshot by parsing storage into a new object on every `getSnapshot` call.
- Run `npm run preflight` before treating a code change as complete.
- Do not claim Cloudflare deployment success until the deploy workflow is actually green.
