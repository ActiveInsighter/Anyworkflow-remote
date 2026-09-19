import type { DispatchExecutionMode, PlanMeta } from '../types'
import { MAX_CONCURRENCY } from './config'

const titlePattern = /^\s*@run\s*=\s*(.*?)\s*$/imu
const modePattern = /^\s*@mode\s*=\s*(serial|parallel)\s*$/imu
const concurrencyPattern = /^\s*@maxConcurrency\s*=\s*(\d+)\s*$/imu

export function parsePlanMeta(source: string): PlanMeta {
  const title = source.match(titlePattern)?.[1]?.trim() || 'Cloud run'
  const mode = (source.match(modePattern)?.[1]?.toLowerCase() || 'serial') as DispatchExecutionMode
  const rawConcurrency = Number(source.match(concurrencyPattern)?.[1] || 1)
  const maxConcurrency = mode === 'serial'
    ? 1
    : Math.max(1, Math.min(MAX_CONCURRENCY, Number.isFinite(rawConcurrency) ? Math.floor(rawConcurrency) : 1))
  return { title, mode, maxConcurrency }
}

export function applyPlanMeta(source: string, meta: PlanMeta): string {
  const title = meta.title.replace(/[\r\n]+/gu, ' ').trim() || 'Cloud run'
  const mode = meta.mode
  const maxConcurrency = mode === 'serial'
    ? 1
    : Math.max(1, Math.min(MAX_CONCURRENCY, Math.floor(meta.maxConcurrency || 1)))

  let body = source
    .replace(titlePattern, '')
    .replace(modePattern, '')
    .replace(concurrencyPattern, '')
    .replace(/^\s+/, '')

  const header = [
    `@run=${title}`,
    `@mode=${mode}`,
    ...(mode === 'parallel' ? [`@maxConcurrency=${maxConcurrency}`] : []),
  ].join('\n')

  body = body.trim()
  return body ? `${header}\n\n${body}\n` : `${header}\n\n`
}

export function createStarterPlan(): string {
  return `@run=新工作流
@mode=serial

@task Task {
  @mode=serial

  @event Event {
    {

    }
  }
}
`
}

export function getEventTitle(queue: string, fallback: string): string {
  const match = queue.match(/^\s*@(?:task|event)\s*=\s*([^\n]+)$/imu)
  return match?.[1]?.trim() || fallback
}

export interface QueuePart {
  type: 'message' | 'url' | 'act' | 'raw'
  title?: string
  text: string
  url?: string
}

export function parseQueue(source: string): QueuePart[] {
  const text = source.replace(/^(?:\s*@(task|event)\s*=[^\n]*\n)+/giu, '').trim()
  if (!text) return []

  const lines = text.split(/\r?\n/u)
  const items: QueuePart[] = []
  let buffer: string[] = []
  let inFence = false

  const flush = () => {
    const value = buffer.join('\n').trim()
    if (value) items.push({ type: 'message', text: value })
    buffer = []
  }

  for (const line of lines) {
    if (/^\s*```/u.test(line)) {
      if (inFence) {
        flush()
        inFence = false
      } else {
        flush()
        inFence = true
      }
      continue
    }

    if (inFence) {
      buffer.push(line)
      continue
    }

    const url = line.trim().match(/^https?:\/\/\S+$/iu)
    if (url) {
      flush()
      items.push({ type: 'url', text: url[0], url: url[0] })
      continue
    }

    const act = line.match(/^\s*@act(?:\s+(.+?))?\s*$/iu)
    if (act) {
      flush()
      items.push({ type: 'act', title: act[1]?.trim() || '动作', text: line.trim() })
      continue
    }

    buffer.push(line)
  }

  flush()
  return items.length ? items : [{ type: 'raw', text }]
}
