import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { isLoopHeaderLine } from '../../../../shared/dsl-kit/loops.mjs'

interface DslState {
  inFence: boolean
  fence: string
}

const LOOP_NAMES_BEFORE_IN = /^(\s*@for\s+[A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*\s+)in(?![A-Za-z0-9_])/iu

/** Offset of the `in` that separates a `@for` header's names from its source, or -1 on other lines. */
function loopInOffset(line: string): number {
  if (!isLoopHeaderLine(line.trim())) return -1
  const match = LOOP_NAMES_BEFORE_IN.exec(line)
  return match ? match[1].length : -1
}

/** Token-level highlighting for the plan DSL. Structure and validity come from `lib/workflow-dsl`. */
export const anyWorkflowLanguage = StreamLanguage.define<DslState>({
  startState: () => ({ inFence: false, fence: '' }),
  copyState: (state) => ({ ...state }),
  token(stream, state) {
    if (stream.sol()) {
      const rest = stream.string.slice(stream.pos)
      const fence = rest.match(/^\s*(```|~~~)/u)?.[1]
      if (fence) {
        if (!state.inFence) {
          state.inFence = true
          state.fence = fence
        } else if (state.fence === fence) {
          state.inFence = false
          state.fence = ''
        }
        stream.skipToEnd()
        return 'string'
      }
    }

    if (state.inFence) {
      stream.skipToEnd()
      return 'string'
    }

    if (stream.pos === loopInOffset(stream.string) && stream.match(/in(?![A-Za-z0-9_])/iu)) return 'keyword'
    if (stream.match(/@[A-Za-z][A-Za-z0-9]*/)) return 'keyword'
    // start_url is the one variable the compiler gives a meaning to, so it is drawn differently.
    if (stream.match(/\bstart_url\b(?=\s*=)/)) return 'special'
    if (stream.match(/%[A-Za-z_][A-Za-z0-9_]*(?::[A-Za-z0-9_]+)?%/)) return 'variableName'
    if (stream.match(/<(?:https?:\/\/[^>]+|self|current|here|本页|当前页|当前页面)>/iu)) return 'link'
    if (stream.match(/<\s*(?:sleep|wait)\s*\([^<>]*\)\s*>/iu)) return 'function'
    if (stream.match(/\b(?:serial|parallel)\b/)) return 'atom'
    if (stream.match(/\brange(?=\()/)) return 'function'
    if (stream.match(/\*\d+/)) return 'number'
    if (stream.match(/\b\d+\b/)) return 'number'
    if (stream.match(/[{}()[\],=]/)) return 'bracket'
    if (stream.match(/#.*/)) return 'comment'
    stream.next()
    return null
  },
})

const anyWorkflowHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--cm-keyword)', fontWeight: '600' },
  { tag: tags.variableName, color: 'var(--cm-variable)' },
  { tag: tags.special(tags.variableName), color: 'var(--cm-link)', fontWeight: '700' },
  { tag: tags.string, color: 'var(--cm-string)' },
  { tag: tags.link, color: 'var(--cm-link)', textDecoration: 'underline' },
  { tag: tags.atom, color: 'var(--cm-atom)' },
  { tag: tags.number, color: 'var(--cm-number)' },
  { tag: tags.function(tags.variableName), color: 'var(--cm-function)' },
  { tag: tags.comment, color: 'var(--cm-comment)', fontStyle: 'italic' },
  { tag: tags.bracket, color: 'var(--cm-bracket)' },
])

export const anyWorkflowHighlighting = syntaxHighlighting(anyWorkflowHighlightStyle)
