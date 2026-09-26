import type { PlanMeta } from '../types'
import { MAX_CONCURRENCY } from './config'
import { readRunPlanMeta } from './workflow-dsl'

const titlePattern = /^\s*@run\s*=\s*(.*?)\s*$/imu
const modePattern = /^\s*@mode\s*=\s*(serial|parallel)\s*$/imu
const concurrencyPattern = /^\s*@maxConcurrency\s*=\s*(\d+)\s*$/imu
const runBlockPattern = /^\s*@(task|codex)(?:\s+.*?)?\s*\{\s*$/iu
const runLoopPattern = /^\s*@for\s+[A-Za-z_][A-Za-z0-9_]*\s+in\s+range\(.*?\)\s*\{\s*$/iu

export function parsePlanMeta(source: string): PlanMeta {
  return readRunPlanMeta(source)
}

export function applyPlanMeta(source: string, meta: PlanMeta): string {
  const title = meta.title.replace(/[\r\n]+/gu, ' ').trim() || 'Cloud run'
  const mode = meta.mode
  const maxConcurrency = mode === 'serial'
    ? 1
    : Math.max(1, Math.min(MAX_CONCURRENCY, Math.floor(meta.maxConcurrency || 1)))

  let seenBlock = false
  const body = source
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .filter((line) => {
      if (!seenBlock && (titlePattern.test(line) || modePattern.test(line) || concurrencyPattern.test(line))) return false
      if (runBlockPattern.test(line) || runLoopPattern.test(line)) seenBlock = true
      return true
    })
    .join('\n')
    .replace(/^\s+/, '')

  const header = [
    `@run=${title}`,
    `@mode=${mode}`,
    ...(mode === 'parallel' ? [`@maxConcurrency=${maxConcurrency}`] : []),
  ].join('\n')

  const trimmedBody = body.trim()
  return trimmedBody ? `${header}\n\n${trimmedBody}\n` : `${header}\n\n`
}

export function createStarterPlan(title = ''): string {
  return `@run=${title}
@mode=serial

@task Task {
  @mode=serial

  @event Event {
    {
      在这里写第一条消息
    }
  }
}
`
}
