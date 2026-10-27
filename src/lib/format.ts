import type { DispatchEventStatus, DispatchExecutionMode } from '../types'

/** Display formatting shared by every page. Status wording lives in domain/run-status.ts. */

export function formatDateTime(value: string): string {
  if (!value) return '—'
  const normalized = value.trim().replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/u, '$1T$2')
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function progressPercent(completed: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((Math.max(0, completed) / total) * 100)))
}

export function progressText(completed: number, total: number, unit: string): string {
  if (!total) return `0 ${unit}`
  return `${Math.min(Math.max(0, completed), total)} / ${total} ${unit}`
}

export function modeLabel(mode: DispatchExecutionMode, maxConcurrency: number, unit: string): string {
  return mode === 'parallel' ? `并行 · 最多 ${maxConcurrency} 个${unit}` : '串行'
}

export function eventProgressLabel(status: DispatchEventStatus, progress: Record<string, unknown> | null): string {
  if (progress) {
    for (const key of ['message', 'summary', 'phase', 'status']) {
      const value = progress[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
    if (typeof progress.current === 'number' && typeof progress.total === 'number' && progress.total > 0) {
      return `${progress.current} / ${progress.total}`
    }
  }
  if (status === 'waiting') return '等待云端编排'
  if (status === 'ready') return '等待执行器领取'
  if (status === 'leased') return '执行器已分配，等待启动'
  if (status === 'running') return '等待执行器上报进度'
  if (status === 'paused') return '等待恢复执行'
  return '暂无进度信息'
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** "刚刚" / "5 分钟前" / "3 小时前" within a day, then the absolute date and time. */
export function formatRelativeTime(value: string, now = Date.now()): string {
  if (!value) return '—'
  const time = Date.parse(value.trim().replace(/^(\d{4}-\d{2}-\d{2}) /u, '$1T'))
  if (Number.isNaN(time)) return value
  const minutes = Math.floor((now - time) / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} 小时前`
  return formatDateTime(value)
}
