/**
 * A small Markdown reader for captured pages. Captured text is untrusted, so this only ever
 * produces plain data for React to render as text: there is no HTML path, a link keeps its target
 * as a string for the caller to vet, and images stay out, since loading them would tell the
 * source site who is reading.
 */

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong' | 'emphasis' | 'code'; text: string }
  | { kind: 'link'; text: string; href: string }
  | { kind: 'image'; text: string }

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3 | 4; inlines: Inline[] }
  | { kind: 'paragraph'; inlines: Inline[] }
  | { kind: 'quote'; inlines: Inline[] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] }
  | { kind: 'code'; text: string }
  | { kind: 'rule' }

/**
 * Every span is bounded: a page can open thousands of brackets it never closes, and an unbounded
 * class would rescan the rest of the text from each one, freezing the tab on hostile input.
 */
const INLINE = /!\[([^\]]{0,500})\]\([^)]{0,2048}\)|\[([^\]]{1,500})\]\(([^)\s]{1,2048})(?:\s+"[^"]{0,500}")?\)|`([^`]{1,2000})`|\*\*([^*]{1,2000})\*\*|__([^_]{1,2000})__|\*([^*\s][^*]{0,2000})\*/gu

export function parseInlines(text: string): Inline[] {
  const inlines: Inline[] = []
  let cursor = 0
  for (const match of text.matchAll(INLINE)) {
    if (match.index > cursor) inlines.push({ kind: 'text', text: text.slice(cursor, match.index) })
    const [whole, image, linkText, href, code, strong, strongAlt, emphasis] = match
    if (whole.startsWith('!')) inlines.push({ kind: 'image', text: image ?? '' })
    else if (linkText !== undefined && href !== undefined) inlines.push({ kind: 'link', text: linkText, href })
    else if (code !== undefined) inlines.push({ kind: 'code', text: code })
    else if (strong !== undefined || strongAlt !== undefined) inlines.push({ kind: 'strong', text: strong ?? strongAlt ?? '' })
    else inlines.push({ kind: 'emphasis', text: emphasis ?? '' })
    cursor = match.index + whole.length
  }
  if (cursor < text.length) inlines.push({ kind: 'text', text: text.slice(cursor) })
  return inlines
}

const HEADING = /^(#{1,6})\s+(.*)$/u
const FENCE = /^\s*(```|~~~)/u
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/u
const BULLET = /^\s*[-*+]\s+(.*)$/u
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/u
const QUOTE = /^\s*>\s?(.*)$/u

/** A heading's text without its optional closing `#`s, scanned by hand to stay linear. */
function headingText(text: string): string {
  const trimmed = text.trim()
  let end = trimmed.length
  while (end > 0 && trimmed[end - 1] === '#') end -= 1
  const closed = end < trimmed.length && (end === 0 || /\s/u.test(trimmed[end - 1] ?? ''))
  return closed ? trimmed.slice(0, end).trimEnd() : trimmed
}

function startsBlock(line: string): boolean {
  return !line.trim() || HEADING.test(line) || FENCE.test(line) || RULE.test(line) || BULLET.test(line) || NUMBERED.test(line) || QUOTE.test(line)
}

export function parseMarkdown(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/gu, '\n').split('\n')
  const blocks: Block[] = []
  let index = 0
  const take = (pattern: RegExp): string[] => {
    const taken: string[] = []
    for (let match = pattern.exec(lines[index] ?? ''); match && index < lines.length; match = pattern.exec(lines[index] ?? '')) {
      taken.push(match[1] ?? '')
      index += 1
    }
    return taken
  }

  while (index < lines.length) {
    const line = lines[index] ?? ''
    if (!line.trim()) {
      index += 1
      continue
    }
    if (FENCE.test(line)) {
      const fence = FENCE.exec(line)?.[1] ?? '```'
      const code: string[] = []
      index += 1
      while (index < lines.length && !(lines[index] ?? '').trim().startsWith(fence)) {
        code.push(lines[index] ?? '')
        index += 1
      }
      index += 1
      blocks.push({ kind: 'code', text: code.join('\n') })
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      const level = Math.min(heading[1]?.length ?? 1, 4) as 1 | 2 | 3 | 4
      blocks.push({ kind: 'heading', level, inlines: parseInlines(headingText(heading[2] ?? '')) })
      index += 1
      continue
    }
    if (RULE.test(line)) {
      blocks.push({ kind: 'rule' })
      index += 1
      continue
    }
    if (QUOTE.test(line)) {
      blocks.push({ kind: 'quote', inlines: parseInlines(take(QUOTE).join(' ').trim()) })
      continue
    }
    if (BULLET.test(line) || NUMBERED.test(line)) {
      const ordered = NUMBERED.test(line)
      blocks.push({ kind: 'list', ordered, items: take(ordered ? NUMBERED : BULLET).map(parseInlines) })
      continue
    }
    const paragraph: string[] = []
    do {
      paragraph.push((lines[index] ?? '').trim())
      index += 1
    } while (index < lines.length && !startsBlock(lines[index] ?? ''))
    blocks.push({ kind: 'paragraph', inlines: parseInlines(paragraph.join(' ')) })
  }
  return blocks
}
