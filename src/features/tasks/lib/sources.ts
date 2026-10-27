import type { LucideIcon } from 'lucide-react'
import { FileDown, FileText, Workflow } from 'lucide-react'
import { listTaskFeed } from '@/lib/api/task-feed'
import { fileConversionKind, runExportKind, runKind, type TaskKind, type TaskView } from '@/lib/tasks'
import type { DispatchRunRecord } from '@/types'
import type { RunExportRecord } from '@/types/run-export'

/** One async task as the task center shows it, whatever its kind. */
export interface TaskItem {
  key: string
  kind: TaskKind
  record: { id: string; status: string }
  view: TaskView
  title: string
  detail: string
  href: string
  updated: string
  error: string
}

/**
 * A kind the task center follows: how to read its feed and how one record reads as a TaskItem.
 * Adding a kind of async work to the console is one more entry in TASK_SOURCES.
 */
export interface TaskSource {
  kind: TaskKind
  label: string
  icon: LucideIcon
  load(options: { since: number }, signal: AbortSignal): Promise<TaskItem[]>
}

function item(kind: TaskKind, record: { id: string; status: string; updated: string }, fields: Pick<TaskItem, 'title' | 'detail' | 'href'> & { error?: string }): TaskItem {
  return { key: `${kind.id}:${record.id}`, kind, record, view: kind.describe(record), updated: record.updated, error: fields.error ?? '', ...fields }
}

interface ConversionRow { id: string; owner: string; status: string; title: string; outputName: string; updated: string; error: string; startPage?: number | null; endPage?: number | null }

export const TASK_SOURCES: TaskSource[] = [
  {
    kind: runKind,
    label: '工作流',
    icon: Workflow,
    async load(options, signal) {
      const rows = await listTaskFeed<DispatchRunRecord>(runKind, options, signal)
      return rows.map((run) => item(runKind, run, {
        title: run.title || '未命名 Run',
        detail: run.totalTasks > 0 ? `${run.completedTasks} / ${run.totalTasks} Tasks` : '',
        href: `/runs/${encodeURIComponent(run.id)}`,
      }))
    },
  },
  {
    kind: fileConversionKind,
    label: '文件转换',
    icon: FileText,
    async load(options, signal) {
      const rows = await listTaskFeed<ConversionRow>(fileConversionKind, options, signal)
      return rows.map((job) => item(fileConversionKind, job, {
        title: job.title || job.outputName || '转换任务',
        detail: `${job.outputName || job.title}.zip`,
        href: '/file-converter',
        error: job.error,
      }))
    },
  },
  {
    kind: runExportKind,
    label: '对话导出',
    icon: FileDown,
    async load(options, signal) {
      const rows = await listTaskFeed<RunExportRecord>(runExportKind, options, signal)
      return rows.map((row) => item(runExportKind, row, {
        title: row.title || 'Run 对话',
        detail: row.contentMode === 'assistant' ? '仅 AI 回复' : '完整对话',
        href: `/runs/${encodeURIComponent(row.run)}?export=1`,
        error: row.error,
      }))
    },
  },
]

export function taskSource(kind: TaskKind): TaskSource {
  return TASK_SOURCES.find((source) => source.kind === kind)!
}
