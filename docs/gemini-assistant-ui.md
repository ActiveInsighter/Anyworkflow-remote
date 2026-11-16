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

The page fills the application viewport. It provides desktop history, a mobile history
modal, a fixed composer, model/configuration controls, Markdown batching with previews,
segment selection, cancellation, safe Markdown, copy/download and JSON response export.
Follow-up sends a `parentMessage` ID and the backend builds its history from owned
persisted messages. The new job stores that context so browser refreshes preserve it.
A new conversation clears the context. Canceled or empty replies cannot be continued.

Response version 1 renders ordered thought summaries, tool requests/results with call
IDs, artifact descriptors, source links, token details and raw public response metadata.
Only http(s) source links are clickable. Signatures and credentials are not displayed;
metadata is normalized/redacted by the executor and validated by the backend. Model
thought usage without a returned summary has an explicit unavailable state. Old records
still show their saved reply and usage, without invented tool activity.

Apply the workers backend's `1794800000_gemini_response_snapshots.js` migration and
associated Gemini hooks first. Push the converter executor, pin
`wrangler.converter.jsonc`'s `GITHUB_GEMINI_RESPONSE_REF` to its tested commit, then
push this Remote branch. This preview uses the tag `preview/gemini-response-a8289bd`
(converter commit `a8289bdd23b51ead88595199954027838fef48bd`), because workflow
dispatch requires a branch or tag ref. Deploy the compatible shared dispatcher with
`npm exec wrangler deploy -- --config wrangler.converter.jsonc` before pushing
the frontend branch; the existing preview workflow deploys the frontend: new clients select response version 1, old tasks still dispatch
main, and client input never selects a Git ref. Preview shares the existing authenticated
PocketBase and uses the established preview file-library bucket.

Required checks: `npm run preflight`, `npm run test:browser`. The Gemini browser
regression covers send/cancel, lost-submit retry identity and draft restoration,
Markdown batching, thought/tool/source/usage display, response downloads, continued
conversation identity, refresh, mobile history, light/dark and 320/390/760/1440 widths.

Capture semantics: https://ai.google.dev/gemini-api/docs/generate-content/thinking
and https://ai.google.dev/gemini-api/docs/thinking . Only provider-labelled public
thought summaries are retained. Unsupported agent configuration is never guessed.
