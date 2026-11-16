# Official assistant-ui components

Installed through the official shadcn registry, Radix/new-york variant:

```sh
npx shadcn add @assistant-ui/thread @assistant-ui/thread-list @assistant-ui/threadlist-sidebar @assistant-ui/model-selector
```

Registry: https://r.assistant-ui.com/styles/new-york/{name}.json
Source: https://github.com/assistant-ui/assistant-ui
Reference checkout: `294e932dbb073b75ebc3c24540f98909a64f18c9`.

`upstream.json` records the published registry items, installed file hashes and
source comparisons. All 24 assistant-ui files match published registry source
when local import aliases are normalized. The registry itself generates the
Radix variant from upstream Base UI sources; those differences are upstream.
`ui/` contains the official shadcn prerequisites installed alongside them.

Integration changes are import aliases only: primitives and hooks are isolated
under this directory to preserve the rest of AnyWorkflow, and `cn` resolves to
`@/lib/utils`. Chat components, markup, labels and styles are upstream source.
The Gemini feature supplies the external-store runtime and the official starter
shell, plus backend settings, segment selection and response metadata controls.
The model selector uses the supported `ComposerExtra` slot.

The upstream MIT license is included in `LICENSE`.
