---
name: frontend-quality-gate
description: Validate AnyWorkflow Remote React/TypeScript changes before completion, especially bug fixes, refactors, session/state changes, routing changes, and releases.
---

# Frontend quality gate

Use this skill before declaring implementation complete.

## Required checks

1. Run `npm run typecheck`.
2. Run `npm run build` (or `npm run preflight`).
3. For auth/session changes, verify:
   - login transition
   - refresh with an existing session
   - logout
   - 401/403 session clearing
   - cross-tab storage events
4. For `useSyncExternalStore`, `getSnapshot` must return a referentially stable value until the store changes.
5. Effects must clean up timers/listeners and ignore stale async results.
6. Render failures must reach `AppErrorBoundary` instead of producing a blank screen.
7. Do not swallow API errors; present an actionable message.
8. Treat TypeScript assertions as a last resort; prefer narrowing and explicit types.

## Completion bar

A change is complete only when the current head passes the relevant CI/build checks. If deployment is requested, also verify the deployment workflow result and deployed URL.
