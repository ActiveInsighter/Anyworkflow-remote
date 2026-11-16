# Gemini assistant-ui workspace

Gemini now uses the official MIT-licensed `@assistant-ui/react` runtime, thread,
message, action-bar and composer primitives with `@assistant-ui/react-markdown`.
The packages are installed and locked in this repository; no external chat service
or Assistant Cloud account is required. Upstream: https://github.com/assistant-ui/assistant-ui
Runtime documentation: https://www.assistant-ui.com/docs/runtimes/custom/external-store

The existing PocketBase jobs and segments remain authoritative. The external-store
adapter reads the selected segment, polls job status, and displays the saved complete
reply. It does not call Gemini from the browser or consume model token streams.
Persisted tool calls are read-only UI data and cannot invoke frontend tools.

The chat UI is installed directly from assistant-ui's official shadcn registry
(Radix/new-york): Thread, ThreadList, ThreadListSidebar, attachments, reasoning,
tool fallback, Markdown and model selector. The former hand-authored chat,
composer, history and response components have been removed. The route uses the
official starter shell without the surrounding AnyWorkflow navigation. The
registry components are unchanged except for local import aliases; provenance,
24 source comparisons and installed hashes are in
`src/components/assistant-ui/upstream.json`, with its MIT license alongside.

The backend adapter supplies model presets, Markdown attachments, segment
selection, settings, cancellation and persisted conversation history. Native
assistant-ui handles composer draft/attachment restoration through
`MessageNotSentError`; retries reuse the same backend idempotency key.
Follow-ups share a persistent thread root, so one conversation occupies one
sidebar row. Official rename/archive/delete actions update the owned entire
conversation through authenticated backend endpoints. Apply
`1794800100_gemini_thread_metadata.js` and the associated hooks before this UI.
The migration retains existing data and adds owner/thread indexing.

Public thought summaries and matched tool calls/results are converted to native
assistant-ui message parts and displayed by its original components. The
Response details dialog provides usage, finish reason, artifacts, citations and
all captured public response metadata, with a JSON download. Unmatched tool
results are preserved without inventing call associations. Signatures and
credentials are normalized/redacted by the executor and validated by the
backend. No private reasoning is fabricated when the provider returns none.

Apply the workers backend's `1794800000_gemini_response_snapshots.js` migration and
associated Gemini hooks first. Push the converter executor, pin
`wrangler.converter.jsonc`'s `GITHUB_GEMINI_RESPONSE_REF` to its tested commit, then
push this Remote branch. This preview uses the tag `preview/gemini-response-938532b`
(converter commit `938532b`), because workflow
dispatch requires a branch or tag ref. Deploy the compatible shared dispatcher with
`npm exec wrangler deploy -- --config wrangler.converter.jsonc` before pushing
the frontend branch; the existing preview workflow deploys the frontend: new clients select response version 1, old tasks still dispatch
main, and client input never selects a Git ref. Preview shares the existing authenticated
PocketBase and uses the established preview file-library bucket.

Required checks: `npm run preflight`, `npm run test:browser`. The Gemini browser
regression covers send/cancel, lost-submit retry identity and draft restoration,
native Markdown upload and library deep links, thought/tool/usage metadata, response
downloads, grouped follow-ups, rename/archive/restore/delete, refresh, mobile sidebar,
light/dark and 320/390/760/1440 widths.

Capture semantics: https://ai.google.dev/gemini-api/docs/generate-content/thinking
and https://ai.google.dev/gemini-api/docs/thinking . Only provider-labelled public
thought summaries are retained. Unsupported agent configuration is never guessed.

The coordinator explicitly uses immediate Durable Object code updates. Cloudflare's
new default can defer an active object's code for five minutes after a successful
Worker deployment, which can otherwise dispatch new-format jobs through an old
executor. Job intents and results already live in PocketBase, so the coordinator can
restart and reconcile existing Actions IDs without resending generation. The
`/dispatcher` health response exposes `geminiResponseRef` so release checks verify
the active object's executor, not just the stateless Worker's uploaded version.
See https://developers.cloudflare.com/durable-objects/deployments/durable-objects-code-updates/ .
