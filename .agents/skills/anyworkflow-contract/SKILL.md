---
name: anyworkflow-contract
description: Preserve AnyWorkflow backend/API compatibility when changing PocketBase calls, authentication, Run/Task/Event records, command handling, workflow DSL, polling, or ownership validation.
---

# AnyWorkflow contract

Use this skill whenever code touches `src/lib/api.ts`, `src/lib/session.ts`, `src/lib/plan.ts`, record types, or pages that mutate Runs.

## Invariants

1. Collections stay compatible with the mini program:
   - `aw_clients`
   - `aw_dispatch_runs`
   - `aw_dispatch_tasks`
   - `aw_dispatch_events`
2. Every returned Run/Task/Event must belong to the authenticated owner's record id.
3. Run control uses `requestedAction` plus `commandVersion + 1`; do not invent a second command channel.
4. Client-owned definition fields and worker-owned runtime fields must remain separated.
5. Draft Runs may be edited. Active Runs must not have their definitions rewritten.
6. Delete only draft or terminal Runs unless the backend contract is explicitly changed.
7. Run children are Task or For<Task>. Task children are Event or For<Event>. The client ultimately executes Event queues.
8. Treat Event queue text as opaque unless a UI view is explicitly parsing it for display.
9. Keep current size/concurrency limits unless the backend changes: max concurrency 16, Run plan 2 MiB, Event queue 768 KiB.
10. On 401/403, clear the local auth session and surface an actionable UI state.

## Review checklist

- Does the web client still interoperate with Anyworkflow-wechat?
- Is ownership checked?
- Are worker runtime fields untouched by client mutations?
- Are command versions monotonic?
- Is a running definition protected from accidental edits?
