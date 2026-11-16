# Gemini: the actual assistant-ui homepage UI

The Gemini route now uses the homepage **HomeDemo source**, not the default
Starter UI. `src/components/assistant-ui/home-demo` contains its shell, thread,
composer, messages, action bar, sidebar, reasoning, follow-up chips and fullscreen
behavior. Its `shared/tool-trace.tsx` is the Parameters/Result disclosure from
the website. Original styles and the website's sand/Public Sans/JetBrains Mono
theme are retained. See `src/components/assistant-ui/UPSTREAM.md` and
`upstream.json` for pinned sources, registry provenance and installed hashes.

Installation uses the official `npx assistant-ui@latest setup` workflow and
`assistant-ui add` CLI. The website's Base UI elements are installed in isolation
from AnyWorkflow's existing primitives. `assistant-ui doctor` checks versions.
The page keeps the existing `/gemini` placement and uses one runtime provider.

The official ExternalStoreRuntime adapter connects to owned PocketBase jobs and
the existing GitHub Actions executor. It polls complete snapshots, with no model
token stream and no website model calls. Native attachments preserve Markdown,
selected segments and failed-send drafts; retries reuse their idempotency key.
Previous turns retain their public tool/reasoning records and stable message IDs.
Markdown documents use the website's attachment tiles instead of huge input bubbles.

Original regenerate/edit controls create owned replacement jobs that keep the
conversation root and previous context; original replies remain stored. Feedback,
pinning, renaming, archive/restore and whole-conversation deletion persist through
authenticated endpoints. Browser speech adapters power dictation and read-aloud
where supported. Token context comes from provider usage and the real model
catalog; an unknown model capacity is not guessed. Duration uses persisted start
and finish timestamps. Old records without timings display no invented duration.

Settings, segment selection and Response details live in the original menu. The
message overflow also opens details for older responses. This includes usage,
finish/error state, citations, artifacts and normalized public response metadata,
with JSON export. Matched tools render Parameters and Result in the website's
ToolTraceCard. Unmatched results and artifacts use the same component separately.
No private reasoning or result associations are invented.

Required backend migrations: `1794800000_gemini_response_snapshots.js`,
`1794800100_gemini_thread_metadata.js`, `1794800200_gemini_ui_actions.js`, with the
matching Gemini hooks. They are additive and retain existing records. The shared
converter remains pinned to `preview/gemini-response-938532b`, and uses immediate
Durable Object code updates so the active executor matches the deployed version.

Verify with `npm run preflight`, `npm run test:browser` and real authenticated
Gemini/Antigravity replies in the preview. The Gemini case covers native upload,
failed-submit recovery, public traces, unlinked results, tokens and timing,
feedback, follow-up context, regeneration/editing, pin/archive/restore/delete,
fullscreen, library deep links, and desktop/mobile light/dark layouts.
