export type SourceBlockKind = 'task' | 'codex' | 'event' | 'act' | 'for' | 'message'

export interface SourceBlock {
  kind: SourceBlockKind | null
  headerFrom: number
  headerEnd: number
  openAt: number
  closeAt: number
  indent: string
}

export interface SourceStructure {
  blocks: SourceBlock[]
  closed: boolean
}

export function lineStartAt(source: string, at: number): number {
  if (at <= 0) return 0
  const newline = source.lastIndexOf('\n', Math.min(at, source.length) - 1)
  return newline < 0 ? 0 : newline + 1
}

export function lineEndAfter(source: string, at: number): number {
  const newline = source.indexOf('\n', Math.max(0, at))
  return newline < 0 ? source.length : newline + 1
}

function blockKind(prefix: string): SourceBlockKind | null {
  const directive = prefix.match(/^@(task|codex|event)(?:\s+.*?)?\s*\{$/iu)?.[1]
  if (directive) return directive.toLowerCase() as 'task' | 'codex' | 'event'
  if (/^@act\s*\{$/iu.test(prefix)) return 'act'
  if (/^@for\s+[A-Za-z_][A-Za-z0-9_]*\s+in\s+range\(.*?\)\s*\{$/iu.test(prefix)) return 'for'
  return null
}

/**
 * One scan supplies insertion scopes and copy/delete ranges. Like the executor, matching
 * ignores braces in fenced text; directive-looking prompt text never creates a Task scope.
 * Incomplete blocks retain closeAt=-1 so commands can reject unsafe edits while typing.
 */
export function readSourceStructure(source: string): SourceStructure {
  const blocks: SourceBlock[] = []
  const stack: SourceBlock[] = []
  let fence = ''
  let unexpectedClose = false
  let messageDepth = 0
  let lineFrom = 0
  let headerEnd = lineEndAfter(source, 0)
  let contentFrom = 0
  let indent = ''
  let firstOpenOnLine = true
  let lastClosed: SourceBlock | undefined

  for (let index = 0; index < source.length; index += 1) {
    if (index === lineFrom) {
      headerEnd = lineEndAfter(source, index)
      const rawLine = source.slice(lineFrom, headerEnd)
      const line = rawLine.trim()
      indent = rawLine.match(/^[ \t]*/u)?.[0] ?? ''
      contentFrom = lineFrom + indent.length
      firstOpenOnLine = true
      const marker = line.match(/^(?:```|~~~)/u)?.[0]
      if (fence || marker) {
        if (!fence && marker) fence = marker
        else if (line === fence) fence = ''
        index = headerEnd - 1
        lineFrom = headerEnd
        continue
      }
    }

    const char = source[index]
    if (char === '\n') {
      lineFrom = index + 1
      continue
    }
    if (char === '{') {
      const standaloneMessage = index === contentFrom
      const inlineMessage = messageDepth === 0 && lastClosed?.kind === 'message' &&
        lastClosed.closeAt >= lineFrom && /^(?:\s*\*\d+)?\s*$/u.test(source.slice(lastClosed.closeAt + 1, index))
      const directive = firstOpenOnLine && messageDepth === 0
        ? blockKind(source.slice(contentFrom, index + 1).trim()) : null
      const kind = standaloneMessage || inlineMessage ? 'message' : directive
      firstOpenOnLine = false
      const block: SourceBlock = {
        kind,
        headerFrom: inlineMessage ? index : lineFrom,
        headerEnd,
        openAt: index,
        closeAt: -1,
        indent,
      }
      if (kind === 'message') messageDepth += 1
      blocks.push(block)
      stack.push(block)
    } else if (char === '}') {
      const block = stack.pop()
      if (block) {
        block.closeAt = index
        lastClosed = block
        if (block.kind === 'message') messageDepth -= 1
      } else unexpectedClose = true
    }
  }

  return { blocks, closed: !fence && !unexpectedClose && stack.length === 0 }
}

export function containingBlock(
  structure: SourceStructure,
  sourceLength: number,
  at: number,
  kinds: readonly SourceBlockKind[],
): SourceBlock | null {
  const point = Math.max(0, Math.min(at, sourceLength))
  // Opening order makes the last containing block the innermost, without rescanning source.
  for (let index = structure.blocks.length - 1; index >= 0; index -= 1) {
    const block = structure.blocks[index]
    if (block.kind !== null && kinds.includes(block.kind) &&
      block.headerFrom <= point && (block.closeAt < 0 || point <= block.closeAt)) return block
  }
  return null
}
