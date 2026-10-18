/** Source-text primitives: newline normalisation, line lookup, fenced blocks, braces, templates. */
import { BACKTICK_FENCE, TILDE_FENCE, VARIABLE_TOKEN, type LineIndex, type TemplateValue, type TemplateVars } from './types.ts'

export const UTF8_ENCODER = new TextEncoder()

export function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/gu, '\n')
}

export function createLineIndex(source: string): LineIndex {
  const starts = [0]
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\n') starts.push(index + 1)
  }
  return { original: source, starts }
}

export function lineRange(index: LineIndex, lineNumber: number): { from: number; to: number } {
  const lineIndex = Math.max(0, Math.min(lineNumber - 1, index.starts.length - 1))
  const from = index.starts[lineIndex] ?? 0
  const newline = index.original.indexOf('\n', from)
  const rawTo = newline < 0 ? index.original.length : newline
  return { from, to: Math.max(from, rawTo) }
}

export function lineNumber(text: string, at: number): number {
  let line = 1
  for (let index = 0; index < at && index < text.length; index += 1) {
    if (text[index] === '\n') line += 1
  }
  return line
}

export function globalLine(text: string, at: number, lineBase: number): number {
  return lineBase + lineNumber(text, at)
}

export function lineEnd(text: string, at: number): number {
  const end = text.indexOf('\n', at)
  return end < 0 ? text.length : end
}

export function nextLine(text: string, at: number): number {
  const end = lineEnd(text, at)
  return end < text.length ? end + 1 : end
}

export function isLineStart(text: string, at: number): boolean {
  let index = at - 1
  while (index >= 0 && (text[index] === ' ' || text[index] === '\t')) index -= 1
  return index < 0 || text[index] === '\n'
}

export function fenceAt(text: string, at: number): string {
  if (!isLineStart(text, at)) return ''
  if (text.startsWith(BACKTICK_FENCE, at)) return BACKTICK_FENCE
  if (text.startsWith(TILDE_FENCE, at)) return TILDE_FENCE
  return ''
}

export function skipFence(text: string, at: number): number {
  const marker = fenceAt(text, at)
  if (!marker) return at
  let cursor = nextLine(text, at)
  while (cursor < text.length) {
    const end = lineEnd(text, cursor)
    if (text.slice(cursor, end).trim() === marker) return end < text.length ? end + 1 : end
    cursor = end < text.length ? end + 1 : end
  }
  return text.length
}

export function matchingBrace(text: string, openAt: number): number {
  let depth = 0
  let cursor = openAt
  while (cursor < text.length) {
    const fenced = skipFence(text, cursor)
    if (fenced !== cursor) {
      cursor = fenced
      continue
    }
    if (text[cursor] === '{') depth += 1
    else if (text[cursor] === '}') {
      depth -= 1
      if (depth === 0) return cursor
    }
    cursor += 1
  }
  return -1
}

export function stripQuotes(value: string): string {
  const text = value.trim()
  if (text.length >= 2 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))) {
    return text.slice(1, -1).trim()
  }
  return text
}

export function formatTemplateValue(value: TemplateValue, pad: string | undefined): string {
  const raw = String(value)
  if (!pad) return raw
  const width = Number(pad)
  if (!Number.isSafeInteger(width) || width < 1 || width > 12) return raw
  return raw.padStart(width, '0')
}

export function substitute(text: string, vars: TemplateVars): string {
  return text.replace(VARIABLE_TOKEN, (whole, name: string, pad: string | undefined) => {
    if (!Object.prototype.hasOwnProperty.call(vars, name)) return whole
    return formatTemplateValue(vars[name] ?? '', pad)
  })
}
