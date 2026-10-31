import { isLoopHeaderLine } from '../../../../shared/dsl-kit/loops.mjs'

const INDENT = '  '

/**
 * Re-indents a plan from its block structure. Structural and directive lines get two spaces per
 * nesting level; everything inside a ``` / ~~~ fence is copied through byte for byte. The items of
 * a multi-line `@for x in [` list sit one level deeper than their header, and the `] {` line that
 * closes the list returns to the header's level.
 *
 * Prompt bodies are deliberately never re-indented. They are the text the executor actually
 * receives, and indentation is not neutral inside them: four leading spaces turn a Markdown list
 * into a code block, and two trailing spaces are a hard line break. Rewriting that text would
 * silently change what runs.
 *
 * Fence delimiters themselves *are* aligned to their block because the DSL validator treats
 * fence markers after trimming line indentation, so an aligned legacy fence stays parseable.
 *
 * The result is idempotent: formatting already-formatted source returns it unchanged, so callers
 * can use a string comparison to decide whether a transaction is worth dispatching.
 */
export function formatAnyWorkflowSource(source: string): string {
  const lines = source.split(/\r?\n/u)
  const out: string[] = []
  let depth = 0
  let inFence = false
  // Depth of the `@for` header whose multi-line list is still open, or null outside a list.
  let listDepth: number | null = null

  for (const raw of lines) {
    const trimmed = raw.trim()

    if (/^(?:```|~~~)/u.test(trimmed)) {
      out.push(INDENT.repeat(depth) + trimmed)
      inFence = !inFence
      continue
    }

    if (inFence) {
      out.push(raw)
      continue
    }

    if (!trimmed) {
      out.push('')
      continue
    }

    if (listDepth !== null) {
      // List items hold no braces, so the list ends at its `]` or at the `{` that closes the header.
      if (!trimmed.startsWith(']') && !trimmed.includes('{')) {
        out.push(INDENT.repeat(listDepth + 1) + trimmed)
        continue
      }
      listDepth = null
    }

    const leadingCloses = trimmed.match(/^\}+/u)?.[0].length ?? 0
    const opens = trimmed.match(/\{/gu)?.length ?? 0
    const closes = trimmed.match(/\}/gu)?.length ?? 0
    const lineDepth = Math.max(0, depth - leadingCloses)

    out.push(INDENT.repeat(lineDepth) + trimmed)
    depth = Math.max(0, depth + opens - closes)
    if (isLoopHeaderLine(trimmed) && !trimmed.includes('{')) listDepth = lineDepth
  }

  return out.join('\n')
}
