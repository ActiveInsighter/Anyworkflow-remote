import { parseLoopList, readLoopHeader } from '../../../../shared/dsl-kit/loops.mjs'
import { readSourceStructure, type SourceBlock } from './source-structure.ts'
import { displayStartUrl } from '../../../lib/domain/start-links.ts'
import { findStartUrlDeclaration } from './start-url.ts'

export type OutlineKind = 'task' | 'event' | 'act' | 'for'

export interface OutlineNode {
  kind: OutlineKind
  title: string
  /** Secondary text: a Task's start page, an Act's event name. */
  detail: string
  /** Header start, where navigation lands. */
  from: number
  /** 1-based line of the header; the Act preview keys Events by it. */
  line: number
  /** End of the block (its closing brace), or the document end while unclosed. */
  to: number
  /** `}*n` after the block. */
  repeat: number | null
  /** Message blocks directly inside this node. */
  messages: number
  children: OutlineNode[]
}

const MAX_TITLE = 60

function clip(text: string): string {
  const chars = [...text]
  return chars.length > MAX_TITLE ? `${chars.slice(0, MAX_TITLE - 1).join('')}…` : text
}

function headerOf(source: string, block: SourceBlock): string {
  return source.slice(block.headerFrom, block.openAt).trim()
}

function repeatAfter(source: string, block: SourceBlock): number | null {
  if (block.closeAt < 0) return null
  const match = source.slice(block.closeAt + 1, block.closeAt + 12).match(/^[ \t]*\*(\d+)/u)
  return match ? Number(match[1]) : null
}

function describe(source: string, block: SourceBlock, kind: OutlineKind): Pick<OutlineNode, 'title' | 'detail'> {
  const header = headerOf(source, block)
  if (kind === 'task' || kind === 'event') {
    const name = header.replace(/^@(?:task|event)\b/iu, '').trim()
    return { title: clip(name || (kind === 'task' ? '未命名 Task' : '未命名 Event')), detail: '' }
  }
  if (kind === 'for') {
    const loop = readLoopHeader(source, source.indexOf('@for', block.headerFrom))
    if (!loop?.ok) return { title: clip(header.replace(/^@for\b/iu, '').replace(/\s+/gu, ' ').trim() || '循环'), detail: '' }
    // A list may span many lines; the outline names it by size instead.
    const list = parseLoopList(loop.source)
    const from = list.ok ? `[${list.items.length} 项]` : loop.source.replace(/\s+/gu, ' ')
    return { title: clip(`${loop.names.join(', ')} in ${from}`), detail: '' }
  }
  const end = block.closeAt < 0 ? source.length : block.closeAt
  const event = source.slice(block.openAt + 1, end).match(/^[ \t]*@event[ \t]*=[ \t]*(.*?)[ \t]*$/imu)?.[1] ?? ''
  return { title: 'Act', detail: clip(event) }
}

/**
 * The plan as a navigable tree: Tasks, their Events, and the Acts and loops inside. Messages are
 * counted on the block that holds them rather than listed. Unclosed blocks still appear, so the
 * outline stays useful while the user is typing.
 */
export function readOutline(source: string): OutlineNode[] {
  const structure = readSourceStructure(source)
  const roots: OutlineNode[] = []
  const stack: Array<{ block: SourceBlock; node: OutlineNode | null }> = []
  const end = (block: SourceBlock) => (block.closeAt < 0 ? source.length : block.closeAt)
  let line = 1
  let counted = 0
  const lineOf = (at: number) => {
    // Blocks arrive in source order, so lines are counted once from the previous header.
    for (let index = source.indexOf('\n', counted); index >= 0 && index < at; index = source.indexOf('\n', index + 1)) {
      line += 1
      counted = index + 1
    }
    return line
  }

  for (const block of structure.blocks) {
    while (stack.length && block.openAt > end(stack[stack.length - 1].block)) stack.pop()
    const parent = [...stack].reverse().find((entry) => entry.node)?.node ?? null

    if (block.kind === 'message') {
      if (parent) parent.messages += 1
      stack.push({ block, node: null })
      continue
    }
    if (block.kind === null) {
      stack.push({ block, node: null })
      continue
    }

    const node: OutlineNode = {
      kind: block.kind,
      ...describe(source, block, block.kind),
      from: block.headerFrom,
      line: lineOf(block.headerFrom),
      to: end(block),
      repeat: repeatAfter(source, block),
      messages: 0,
      children: [],
    }
    if (block.kind === 'task') {
      const value = findStartUrlDeclaration(source, structure, block)?.value
      node.detail = value ? displayStartUrl(value) : ''
    }
    ;(parent ? parent.children : roots).push(node)
    stack.push({ block, node })
  }
  return roots
}

/** The deepest node whose range contains `at`, for highlighting the cursor's place. */
export function outlinePathAt(nodes: readonly OutlineNode[], at: number): OutlineNode[] {
  const path: OutlineNode[] = []
  let level: readonly OutlineNode[] = nodes
  for (;;) {
    const hit = level.find((node) => node.from <= at && at <= node.to)
    if (!hit) return path
    path.push(hit)
    level = hit.children
  }
}

export function countOutline(nodes: readonly OutlineNode[]) {
  const counts = { task: 0, event: 0, act: 0, for: 0, messages: 0 }
  const visit = (list: readonly OutlineNode[]) => {
    for (const node of list) {
      counts[node.kind] += 1
      counts.messages += node.messages
      visit(node.children)
    }
  }
  visit(nodes)
  return counts
}
