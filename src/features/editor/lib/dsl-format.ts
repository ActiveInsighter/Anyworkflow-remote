const INDENT = '  '

/**
 * Re-indents a plan from its block structure. Structural and directive lines get two spaces per
 * nesting level; everything inside a ``` / ~~~ fence is copied through byte for byte.
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

    const leadingCloses = trimmed.match(/^\}+/u)?.[0].length ?? 0
    const opens = trimmed.match(/\{/gu)?.length ?? 0
    const closes = trimmed.match(/\}/gu)?.length ?? 0

    out.push(INDENT.repeat(Math.max(0, depth - leadingCloses)) + trimmed)
    depth = Math.max(0, depth + opens - closes)
  }

  return out.join('\n')
}
