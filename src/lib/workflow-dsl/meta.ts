/** Reads Run-level metadata (`@run`, `@mode`, `@maxConcurrency`) from a plan. */
import type { DispatchExecutionMode, PlanMeta } from '../../types'
import { normalizeNewlines, stripQuotes } from './text.ts'

export function readRunPlanMeta(source: string): PlanMeta {
  const normalized = normalizeNewlines(source)
  let title = 'Cloud run'
  let mode: DispatchExecutionMode = 'serial'
  let maxConcurrency = 1
  let seenBlock = false

  for (const raw of normalized.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith('//')) continue
    if (!seenBlock) {
      const titleMatch = line.match(/^@run\s*=\s*(.*?)\s*$/iu)
      if (titleMatch) {
        title = stripQuotes(titleMatch[1] ?? '') || 'Cloud run'
        continue
      }
      const modeMatch = line.match(/^@mode\s*=\s*(serial|parallel)\s*$/iu)
      if (modeMatch) {
        mode = modeMatch[1]?.toLowerCase() as DispatchExecutionMode
        continue
      }
      const concurrencyMatch = line.match(/^@maxConcurrency\s*=\s*(\d+)\s*$/iu)
      if (concurrencyMatch) {
        const parsed = Number(concurrencyMatch[1])
        if (Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 16) maxConcurrency = parsed
        continue
      }
      if (/^@(task|codex)(?:\s+.*?)?\s*\{\s*$/iu.test(line) || /^@for\s+.*\{\s*$/iu.test(line)) {
        seenBlock = true
      }
    }
  }

  return {
    title: title.trim() || 'Cloud run',
    mode,
    maxConcurrency: mode === 'serial' ? 1 : Math.max(1, Math.min(16, Math.floor(maxConcurrency))),
  }
}
