import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { useNow } from '@/hooks/use-now'
import { getRun, toErrorMessage } from '@/lib/api'
import { getWorkflowTemplate, updateWorkflowTemplate } from '@/lib/api/library'
import { reserveDefaultRunTitle } from '@/lib/api/run-name'
import { useSession } from '@/lib/api/session'
import { createStarterPlan, parsePlanMeta } from '@/lib/domain/plan'
import { nextDailyInstant, normalizeRecurrence } from '@/lib/domain/recurrence'
import { canEditRun } from '@/lib/domain/run-status'
import { normalizeRuntimeConfig } from '@/lib/domain/runtime-config'
import type { DispatchRunRecord } from '@/types'
import { validateAnyWorkflowSource } from '@/features/editor/lib/anyworkflow-dsl'
import type { AnyWorkflowEditorHandle } from '@/features/editor/components/anyworkflow-editor'
import { runtimeConfigError } from '@/features/runtime-config/lib/runtime-config-error'
import { invalidateRuns } from '@/features/runs/lib/query-keys'
import { shouldOfferRunDraft, shouldOfferTemplateDraft } from '../lib/draft-recovery'
import { draftScopeFor, legacyDraftScopeFor } from '../lib/editor-draft'
import { editorSaveErrorMessage } from '../lib/save-error'
import { saveRunSource } from '../lib/save-run'
import { useLocalDraft } from './use-local-draft'
import { useRuntimeConfigState } from './use-runtime-config-state'
import { useScheduleState } from './use-schedule-state'

/** What the editor is editing, derived from the route. */
function useEditorTarget() {
  const { runId } = useParams()
  const [searchParams] = useSearchParams()
  const templateId = searchParams.get('templateId') || ''
  const templateMode: '' | 'use' | 'edit' = searchParams.get('mode') === 'edit' ? 'edit' : templateId ? 'use' : ''
  return { runId, templateId, templateMode }
}

/**
 * State and commands for the Run editor: loading the source (new Run, existing Run, or a
 * template), local draft autosave and restore, schedule and runtime config, and saving.
 *
 * Mount one instance per edit target (the page keys it by route and session), so drafts and
 * async loads can never leak from one Run into another.
 */
export function useRunEditor() {
  const { runId, templateId, templateMode } = useEditorTarget()
  const navigate = useNavigate()
  const session = useSession()
  const now = useNow()
  const editorRef = useRef<AnyWorkflowEditorHandle | null>(null)
  const starterName = useRef<Promise<string> | null>(null)
  const scope = draftScopeFor(session?.baseUrl, session?.record.id, runId, templateId)
  const legacyScope = legacyDraftScopeFor(session?.record.id, runId, templateId)

  const [starterReady, setStarterReady] = useState(Boolean(runId || templateId))
  const [loadedRun, setLoadedRun] = useState<DispatchRunRecord | null>(null)
  const [source, setSource] = useState(() => createStarterPlan())
  const [templateTitle, setTemplateTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [runtimeOpen, setRuntimeOpen] = useState(false)
  const markDirty = () => setDirty(true)

  const schedule = useScheduleState({ now, onEdit: markDirty })
  const runtime = useRuntimeConfigState({
    loadsFromRun: Boolean(runId),
    skipDefaults: templateMode === 'edit',
    onDefaultsReloaded: markDirty,
  })
  const scheduleEditable = templateMode !== 'edit'

  const draft = useLocalDraft({
    scope,
    legacyScope,
    dirty,
    payload: () => {
      const meta = parsePlanMeta(source)
      return {
        source,
        title: meta.title,
        mode: meta.mode,
        maxConcurrency: meta.maxConcurrency,
        templateTitle,
        scheduledAt: schedule.scheduledAt,
        recurrence: schedule.activeRecurrence,
        ...(runtime.config && !runtimeConfigError(runtime.config)
          ? { runtimeConfig: normalizeRuntimeConfig(runtime.config) }
          : {}),
      }
    },
    autosaveDeps: [source, templateTitle, schedule.scheduledAt, runtime.config, schedule.mode, schedule.recurrence],
  })

  const meta = useMemo(() => parsePlanMeta(source), [source])
  const diagnostics = useMemo(() => validateAnyWorkflowSource(source), [source])
  const errorCount = diagnostics.filter((item) => item.severity === 'error').length
  const scheduleInvalid = scheduleEditable && schedule.invalid

  // Template in use or being edited.
  useEffect(() => {
    if (!templateId || runId) return
    let active = true
    setLoading(true)
    getWorkflowTemplate(templateId)
      .then((template) => {
        if (!active) return
        setSource(template.planText)
        setTemplateTitle(template.title)
        setDirty(false)
        const { draft: stored, legacy } = draft.readCandidate()
        draft.offerIf(stored, shouldOfferTemplateDraft(stored, legacy, template))
      })
      .catch((cause: unknown) => active && setError(toErrorMessage(cause)))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, runId, scope])

  // Existing Run: drafts edit in place, finished Runs fork a new version on save.
  useEffect(() => {
    if (!runId) return
    let active = true
    setLoading(true)
    getRun(runId)
      .then((run) => {
        if (!active) return
        if (!canEditRun(run)) throw new Error('进行中的 Run 不能编辑，请等待执行结束')
        setLoadedRun(run)
        runtime.adopt(run.runtimeConfig ?? null)
        const initialSchedule = run.status === 'draft' ? run.scheduledAt : ''
        const initialRule = run.status === 'draft' ? run.recurrence : null
        setSource(run.planText)
        schedule.load({ scheduledAt: initialSchedule, recurrence: initialRule })
        setDirty(false)
        const { draft: stored, legacy } = draft.readCandidate()
        draft.offerIf(
          stored,
          shouldOfferRunDraft(stored, legacy, {
            planText: run.planText,
            scheduledAt: initialSchedule,
            recurrence: initialRule,
            runtimeConfig: run.runtimeConfig,
          }),
        )
      })
      .catch((cause: unknown) => active && setError(toErrorMessage(cause)))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, scope])

  // New Run: reserve a default name, unless a local draft can be restored (works offline).
  useEffect(() => {
    if (runId || templateId) return
    let active = true
    setLoading(true)
    const { draft: stored } = draft.readCandidate()
    if (stored) {
      draft.offer(stored)
      setSource(createStarterPlan(stored.title || parsePlanMeta(stored.source).title))
      setStarterReady(true)
      setLoading(false)
      return
    }
    starterName.current ??= reserveDefaultRunTitle()
    starterName.current
      .then((title) => {
        if (!active) return
        setSource(createStarterPlan(title))
        setStarterReady(true)
      })
      .catch((cause: unknown) => active && setError(toErrorMessage(cause)))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, scope, templateId])

  function changeSource(next: string) {
    setSource(next)
    setDirty(true)
  }

  function changeTemplateTitle(next: string) {
    setTemplateTitle(next)
    setDirty(true)
  }

  function restoreDraft() {
    const stored = draft.restorable
    if (!stored) return
    setSource(stored.source)
    schedule.load({ scheduledAt: stored.scheduledAt, recurrence: stored.recurrence, recompute: true })
    if (stored.templateTitle) setTemplateTitle(stored.templateTitle)
    if (stored.runtimeConfig !== undefined) runtime.replace(stored.runtimeConfig)
    setDirty(true)
    draft.consume()
    toast.success('已恢复本地草稿')
  }

  async function persist(publish: boolean) {
    if (!session || saving || loading || (runId && !loadedRun)) return
    if (!runtime.ready || runtime.loading || runtime.invalid) {
      setRuntimeOpen(true)
      return
    }
    if (errorCount > 0) {
      setError(`DSL 有 ${errorCount} 个错误`)
      editorRef.current?.focus()
      return
    }
    if (scheduleInvalid) {
      setError('执行时间必须晚于当前时间；延时至少为 1 分钟')
      setScheduleOpen(true)
      return
    }

    setSaving(true)
    setError('')
    try {
      const planText = source
      const rule = schedule.mode === 'daily' ? normalizeRecurrence(schedule.recurrence) : null
      const scheduledAt = scheduleEditable ? (rule ? nextDailyInstant(rule) : schedule.scheduledAt) : ''

      if (templateMode === 'edit' && templateId) {
        await updateWorkflowTemplate(templateId, { title: templateTitle || meta.title || '未命名模板', planText })
        draft.clearAfterSave()
        setDirty(false)
        toast.success('模板已保存')
        navigate(`/templates/${templateId}`, { replace: true })
        return
      }

      const saved = await saveRunSource({
        sourceRun: runId ? loadedRun : null,
        planText,
        publish,
        scheduledAt,
        runtimeConfig: runtime.config,
        recurrence: rule,
      })

      draft.clearAfterSave()
      setDirty(false)
      invalidateRuns({ lists: true, familyId: saved.familyId, runId: saved.id })
      toast.success(publish ? (rule ? '每天重复计划已启用' : '工作流已提交执行') : '草稿已保存')
      navigate(publish ? `/runs/${saved.id}` : `/runs/${saved.id}/edit`, { replace: true })
    } catch (cause) {
      const message = editorSaveErrorMessage(cause)
      setError(message)
      toast.error('保存失败', { description: message })
    } finally {
      setSaving(false)
    }
  }

  return {
    session,
    now,
    editorRef,
    target: { runId, templateId, templateMode },
    loadedRun,
    starterReady,
    loading,
    saving,
    error,
    dirty,
    source,
    meta,
    errorCount,
    templateTitle,
    schedule,
    scheduleEditable,
    scheduleInvalid,
    scheduleOpen,
    setScheduleOpen,
    runtime,
    runtimeOpen,
    setRuntimeOpen,
    /** Re-runs and checkpoint resumes keep the source Run's config. */
    runtimeLocked: loadedRun?.status === 'draft' && (loadedRun.origin === 'rerun' || loadedRun.origin === 'resume'),
    draft,
    changeSource,
    changeTemplateTitle,
    changeRuntimeConfig(next: Parameters<typeof runtime.replace>[0]) {
      runtime.replace(next)
      setDirty(true)
    },
    restoreDraft,
    persist,
    blocked: saving || errorCount > 0 || scheduleInvalid || !runtime.ready || runtime.loading || runtime.invalid,
  }
}

export type RunEditorModel = ReturnType<typeof useRunEditor>
