import type {
  DispatchEventStatus,
  DispatchRequestedAction,
  DispatchRunOrigin,
  DispatchRunRecord,
  DispatchStatus,
  StatusTone,
  WorkflowHistoryStatus,
} from '../../types'

/**
 * Single source of truth for how Run, Task, Event and history states read in the UI and which
 * actions they allow. Pages ask these helpers instead of comparing status strings inline.
 */

export interface StatusMeta {
  label: string
  tone: StatusTone
}

const RUN_STATUS: Record<DispatchStatus, StatusMeta> = {
  draft: { label: '草稿', tone: 'neutral' },
  queued: { label: '排队中', tone: 'info' },
  running: { label: '执行中', tone: 'warning' },
  succeeded: { label: '已完成', tone: 'success' },
  failed: { label: '失败', tone: 'danger' },
  canceled: { label: '已取消', tone: 'neutral' },
}

const EVENT_STATUS: Record<DispatchEventStatus, StatusMeta> = {
  waiting: { label: '等待编排', tone: 'neutral' },
  ready: { label: '待分配', tone: 'info' },
  leased: { label: '已分配', tone: 'info' },
  running: { label: '执行中', tone: 'warning' },
  paused: { label: '已暂停', tone: 'neutral' },
  terminal: { label: '已结束', tone: 'success' },
}

const RUN_ORIGIN: Record<DispatchRunOrigin, string> = {
  initial: '初始版本',
  rerun: '完整重跑',
  resume: '检查点恢复',
  edited_rerun: '编辑副本',
}

const TERMINAL: ReadonlySet<DispatchStatus> = new Set(['succeeded', 'failed', 'canceled'])

export function isTerminalStatus(status: DispatchStatus): boolean {
  return TERMINAL.has(status)
}

export function isActiveStatus(status: DispatchStatus): boolean {
  return status === 'queued' || status === 'running'
}

/** Drafts edit in place; finished Runs fork a new version. Active definitions are immutable. */
export function canEditRun(run: Pick<DispatchRunRecord, 'status'>): boolean {
  return run.status === 'draft' || isTerminalStatus(run.status)
}

/** The backend rejects deleting active Runs; mirror it so the action is never offered. */
export function canDeleteRun(run: Pick<DispatchRunRecord, 'status'>): boolean {
  return run.status === 'draft' || isTerminalStatus(run.status)
}

/** Pause/resume/cancel availability. Commands go through `requestedAction` + `commandVersion`. */
export function runControls(run: Pick<DispatchRunRecord, 'status' | 'requestedAction'>) {
  const active = isActiveStatus(run.status)
  return {
    canPause: active && run.requestedAction === 'none',
    canResume: active && run.requestedAction === 'pause',
    canCancel: active && run.requestedAction !== 'cancel',
  }
}

export function runStatusMeta(status: DispatchStatus, requestedAction: DispatchRequestedAction = 'none'): StatusMeta {
  if (isActiveStatus(status)) {
    if (requestedAction === 'pause') return { label: '已请求暂停', tone: 'warning' }
    if (requestedAction === 'resume') return { label: '正在恢复', tone: 'info' }
    if (requestedAction === 'cancel') return { label: '正在取消', tone: 'warning' }
  }
  return RUN_STATUS[status] || { label: status, tone: 'neutral' }
}

export function eventStatusMeta(status: DispatchEventStatus, result: string): StatusMeta {
  if (status === 'terminal' && result === 'failed') return { label: '失败', tone: 'danger' }
  if (status === 'terminal' && result === 'canceled') return { label: '已取消', tone: 'neutral' }
  if (status === 'terminal' && result === 'succeeded') return { label: '已完成', tone: 'success' }
  return EVENT_STATUS[status] || { label: status, tone: 'neutral' }
}

export function historyStatusMeta(status: WorkflowHistoryStatus): StatusMeta {
  if (status === 'succeeded') return { label: '已完成', tone: 'success' }
  if (status === 'failed') return { label: '失败', tone: 'danger' }
  if (status === 'canceled') return { label: '已取消', tone: 'neutral' }
  if (status === 'interrupted') return { label: '已中断', tone: 'danger' }
  return { label: '等待执行', tone: 'neutral' }
}

export function historyStatusCompleted(status: WorkflowHistoryStatus): boolean {
  return status !== 'unknown'
}

export function runOriginLabel(origin: DispatchRunOrigin): string {
  return RUN_ORIGIN[origin] ?? RUN_ORIGIN.initial
}

export function runVersionLabel(run: Pick<DispatchRunRecord, 'versionMajor' | 'versionMinor'>): string {
  return `v${run.versionMajor}.${run.versionMinor}`
}

export function runTitle(run: Pick<DispatchRunRecord, 'title'> | null | undefined): string {
  return run?.title || '未命名 Run'
}
