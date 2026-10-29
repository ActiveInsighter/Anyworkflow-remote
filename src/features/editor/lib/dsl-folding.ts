import { foldService } from '@codemirror/language'
import type { Text } from '@codemirror/state'
import { readSourceStructure, type SourceStructure } from './source-structure.ts'

/** Documents are immutable, so one scan per document version serves every gutter line. */
const structures = new WeakMap<Text, SourceStructure>()

export function structureOfDoc(doc: Text): SourceStructure {
  let structure = structures.get(doc)
  if (!structure) {
    structure = readSourceStructure(doc.toString())
    structures.set(doc, structure)
  }
  return structure
}

/**
 * Folds any block whose opening brace ends a line and whose closing brace is on a later line,
 * using the same structure scan as the commands, so fenced text never opens a fold.
 */
export const anyWorkflowFolding = foldService.of((state, lineStart, lineEnd) => {
  const { blocks } = structureOfDoc(state.doc)
  // Blocks are in opening order: start at the first one that opens on this line.
  let low = 0
  let high = blocks.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (blocks[mid].openAt < lineStart) low = mid + 1
    else high = mid
  }
  for (let index = low; index < blocks.length && blocks[index].openAt < lineEnd; index += 1) {
    const block = blocks[index]
    if (block.closeAt < 0) continue
    if (state.doc.sliceString(block.openAt + 1, lineEnd).trim()) continue
    if (block.closeAt <= lineEnd) return null
    const closeLine = state.doc.lineAt(block.closeAt)
    // Keep the closing brace visible: fold up to the end of the line before it.
    const to = closeLine.from - 1
    return to > lineEnd ? { from: lineEnd, to } : null
  }
  return null
})
