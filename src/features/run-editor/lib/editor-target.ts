import { getRun } from '@/lib/api'
import { getWorkflowTemplate } from '@/lib/api/library'
import { canEditRun } from '@/lib/domain/run-status'
import type { DispatchRunRecord } from '@/types'

/** What the Run editor is editing, derived from the route. */
export type EditorTarget =
  | { kind: 'new' }
  | { kind: 'run'; runId: string }
  /** A new Run started from a template. */
  | { kind: 'template-use'; templateId: string }
  /** The template itself. */
  | { kind: 'template-edit'; templateId: string }

export function editorTargetFrom(runId: string | undefined, search: URLSearchParams): EditorTarget {
  if (runId) return { kind: 'run', runId }
  const templateId = search.get('templateId') || ''
  if (!templateId) return { kind: 'new' }
  return search.get('mode') === 'edit' ? { kind: 'template-edit', templateId } : { kind: 'template-use', templateId }
}

export type LoadedDocument =
  | { kind: 'new'; title: string }
  | { kind: 'run'; run: DispatchRunRecord }
  | { kind: 'template'; title: string; planText: string }

/** Fetches what the target needs before the editor can show it. */
export async function loadEditorDocument(
  target: EditorTarget,
  reserveTitle: () => Promise<string>,
): Promise<LoadedDocument> {
  if (target.kind === 'run') {
    const run = await getRun(target.runId)
    if (!canEditRun(run)) throw new Error('进行中的 Run 不能编辑，请等待执行结束')
    return { kind: 'run', run }
  }
  if (target.kind === 'new') return { kind: 'new', title: await reserveTitle() }
  const template = await getWorkflowTemplate(target.templateId)
  return { kind: 'template', title: template.title, planText: template.planText }
}
