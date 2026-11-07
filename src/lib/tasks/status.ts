import type { TaskKind, TaskRecord, TaskState, TaskView } from '@shared/task-kit/index.mjs'
import type { StatusTone } from '../../types'

export interface TaskStatusMeta {
  label: string
  tone: StatusTone
}

/** One colour per lifecycle state, whatever the kind: waiting grey, working blue. */
const STATE_META: Record<TaskState, TaskStatusMeta> = {
  idle: { label: '草稿', tone: 'neutral' },
  queued: { label: '排队中', tone: 'neutral' },
  running: { label: '进行中', tone: 'info' },
  succeeded: { label: '已完成', tone: 'success' },
  partial: { label: '部分完成', tone: 'warning' },
  failed: { label: '失败', tone: 'danger' },
  canceled: { label: '已取消', tone: 'neutral' },
  expired: { label: '已过期', tone: 'neutral' },
}

/** Kind-specific names for the phases inside a state (the tone still follows the state). */
const PHASE_LABELS: Record<string, Record<string, string>> = {
  'file-conversion': {
    queued: '等待调度',
    dispatching: '提交中',
    pending: '排队中',
    running: '转换中',
    uploading: '保存产物中',
  },
  'run-export': {
    queued: '等待导出',
    collecting: '整理对话',
    packaging: '打包中',
    failed: '导出失败',
  },
  run: {
    running: '执行中',
  },
  'page-capture': {
    queued: '等待扩展',
    opening: '打开页面',
    rendering: '等待渲染',
    extracting: '解析内容',
    uploading: '保存结果',
    partial: '内容不完整',
  },
  'web-crawl': {
    queued: '等待调度',
    dispatching: '提交中',
    pending: '等待运行器',
    running: '抓取中',
    partial: '部分失败',
  },
}

/** The phases a running job passes through, in order. Kinds that measure progress need none. */
const PHASES: Record<string, readonly string[]> = {
  'file-conversion': ['dispatching', 'pending', 'running', 'uploading'],
  'run-export': ['collecting', 'packaging'],
  'page-capture': ['opening', 'rendering', 'extracting', 'uploading'],
  // A crawl of several pages measures pages reported instead.
  'web-crawl': ['dispatching', 'pending', 'running'],
}

/** How far a running job has got through its phases, or null when its kind has none. */
export function taskPhase(view: Pick<TaskView, 'kind' | 'status'>): { done: number; total: number } | null {
  const phases = PHASES[view.kind]
  const done = phases?.indexOf(view.status) ?? -1
  return phases && done >= 0 ? { done, total: phases.length } : null
}

export function taskStateMeta(state: TaskState): TaskStatusMeta {
  return STATE_META[state]
}

/** Label and tone for one record of a kind; a pending cancel reads as stopping. */
export function taskStatusMeta(kind: TaskKind, record: TaskRecord): TaskStatusMeta {
  const view = kind.describe(record)
  if (view.stopping) return { label: kind.cancel === 'command' ? '正在取消' : '结束中', tone: 'warning' }
  const base = STATE_META[view.state]
  return { label: PHASE_LABELS[kind.id]?.[view.status] ?? base.label, tone: base.tone }
}
