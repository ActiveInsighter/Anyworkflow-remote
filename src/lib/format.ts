import type {
  DispatchEventStatus,
  DispatchExecutionMode,
  DispatchRequestedAction,
  DispatchStatus,
  StatusTone,
} from '../types'

const STATUS_META: Record<DispatchStatus, { label: string; tone: StatusTone }> = {
  draft: { label: '草稿', tone: 'neutral' },
  queued: { label: '排队中', tone: 'info' },
  running: { label: '执行中', tone: 'warning' },
  succeeded: { label: '已完成', tone: 'success' },
  failed: { label: '失败', tone: 'danger' },
  canceled: { label: '已取消', tone: 'neutral' },
}

const EVENT_META: Record<DispatchEventStatus, { label: string; tone: StatusTone }> = {
  waiting: { label: '等待编排', tone: 'neutral' },
  ready: { label: '待分配', tone: 'info' },
  leased: { label: '已分配', tone: 'info' },
  running: { label: '执行中', tone: 'warning' },
  paused: { label: '已暂停', tone: 'neutral' },
  terminal: { label: '已结束', tone: 'success' },
}

export function runStatusMeta(status: DispatchStatus, requestedAction: DispatchRequestedAction = 'none') {
  if (status === 'queued' || status === 'running') {
    if (requestedAction === 'pause') return { label: '已请求暂停', tone: 'warning' as const }
    if (requestedAction === 'resume') return { label: '正在恢复', tone: 'info' as const }
    if (requestedAction === 'cancel') return { label: '正在取消', tone: 'warning' as const }
  }
  return STATUS_META[status] || { label: status, tone: 'neutral' as const }
}

export function eventStatusMeta(status: DispatchEventStatus, result: string) {
  if (status === 'terminal' && result === 'failed') return { label: '失败', tone: 'danger' as const }
  if (status === 'terminal' && result === 'canceled') return { label: '已取消', tone: 'neutral' as const }
  if (status === 'terminal' && result === 'succeeded') return { label: '已完成', tone: 'success' as const }
  return EVENT_META[status] || { label: status, tone: 'neutral' as const }
}

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

export function terminalResultLabel(result: string): string {
  if (result === 'succeeded') return '执行成功'
  if (result === 'failed') return '执行失败'
  if (result === 'canceled') return '已取消'
  return '尚未结束'
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
