import type { DailyRecurrence } from '@/lib/domain/recurrence'
import type { RuntimeConfig } from '@/lib/domain/runtime-config'
import type { EditorDraft } from './editor-draft'

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/**
 * A stored draft is offered for restore only when it differs from what just loaded. Legacy
 * drafts (keyed without a backend) are always offered, because only the user can confirm them.
 */
export function shouldOfferTemplateDraft(
  stored: EditorDraft | null,
  legacy: boolean,
  template: { planText: string; title: string },
): boolean {
  if (!stored) return false
  return (
    legacy ||
    stored.source.trim() !== template.planText.trim() ||
    stored.runtimeConfig !== undefined ||
    Boolean(stored.scheduledAt) ||
    Boolean(stored.recurrence) ||
    stored.templateTitle !== template.title
  )
}

export function shouldOfferRunDraft(
  stored: EditorDraft | null,
  legacy: boolean,
  run: {
    planText: string
    scheduledAt: string
    recurrence: DailyRecurrence | null | undefined
    runtimeConfig: RuntimeConfig | null | undefined
  },
): boolean {
  if (!stored) return false
  return (
    legacy ||
    stored.source !== run.planText ||
    stored.scheduledAt !== run.scheduledAt ||
    !sameJson(stored.recurrence, run.recurrence) ||
    (stored.runtimeConfig !== undefined && !sameJson(stored.runtimeConfig, run.runtimeConfig))
  )
}
