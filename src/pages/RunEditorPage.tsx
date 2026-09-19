import { CircleCheck, History, Play, Save } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { AnyWorkflowEditor, type AnyWorkflowEditorHandle } from '@/components/editor/AnyWorkflowEditor'
import { validateAnyWorkflowSource } from '@/components/editor/anyworkflow-dsl'
import { AppPage, EmptyState, ErrorBanner, LoadingState, PageHeader } from '@/components/app/ui'
import { SchedulePicker } from '@/components/app/schedule-picker'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { invalidateAsyncDataCache } from '@/hooks/useAsyncData'
import { useNow } from '@/hooks/useNow'
import { createRun, getRun, toErrorMessage, updateRunDraft } from '@/lib/api'
import { clearEditorDraft, draftScopeFor, readEditorDraft, writeEditorDraft, type EditorDraft } from '@/lib/draft'
import { formatDateTime } from '@/lib/format'
import { getWorkflowTemplate, updateWorkflowTemplate } from '@/lib/library'
import { createStarterPlan, parsePlanMeta } from '@/lib/plan'
import { DELAY_PRESETS, defaultScheduleTime, describeSchedule, resolveDelayPreset, toScheduledAt, type ScheduleMode } from '@/lib/schedule'
import { useSession } from '@/lib/session'

const UNSAFE_FILENAME = /[\\/:*?"<>|\u0000-\u001f]/gu

function editorFileName(title: string): string {
  const base = title.trim().replace(UNSAFE_FILENAME, '-').replace(/\s+/gu, ' ').slice(0, 60).trim()
  return `${base || 'plan'}.aw`
}

export function RunEditorPage() {
  const { runId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const templateId = searchParams.get('templateId') || ''
  const templateMode = searchParams.get('mode') === 'edit' ? 'edit' : templateId ? 'use' : ''
  const session = useSession()
  const editorRef = useRef<AnyWorkflowEditorHandle | null>(null)
  const now = useNow()
  const scope = draftScopeFor(runId, templateId)

  const [source, setSource] = useState(createStarterPlan)
  const initialMeta = parsePlanMeta(source)
  const [title, setTitle] = useState(initialMeta.title)
  const [mode, setMode] = useState(initialMeta.mode)
  const [maxConcurrency, setMaxConcurrency] = useState(initialMeta.maxConcurrency)
  const [templateTitle, setTemplateTitle] = useState('')
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('now')
  const [scheduledAt, setScheduledAt] = useState('')
  const [loading, setLoading] = useState(Boolean(runId || templateId))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [restorable, setRestorable] = useState<EditorDraft | null>(null)

  const scheduleEditable = templateMode !== 'edit'
  const scheduleUnresolved = scheduleEditable && scheduleMode !== 'now' && !scheduledAt
  const diagnostics = useMemo(() => validateAnyWorkflowSource(source), [source])
  const errorCount = diagnostics.filter((item) => item.severity === 'error').length

  const sourceRef = useRef(source)
  sourceRef.current = source

  const draftRef = useRef<Omit<EditorDraft, 'savedAt'>>({
    source,
    title,
    mode,
    maxConcurrency,
    templateTitle,
    scheduledAt,
  })
  draftRef.current = { source, title, mode, maxConcurrency, templateTitle, scheduledAt }
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty

  function changeSchedule(next: { mode?: ScheduleMode; value?: string }) {
    if (next.mode !== undefined) {
      setScheduleMode(next.mode)
      if (next.mode === 'now') setScheduledAt('')
      else if (next.mode === 'at') setScheduledAt(toScheduledAt(defaultScheduleTime()))
      else setScheduledAt((current) => current || toScheduledAt(resolveDelayPreset(DELAY_PRESETS[1])))
    }
    if (next.value !== undefined) setScheduledAt(next.value)
    setDirty(true)
  }

  useEffect(() => {
    if (!templateId || runId) return
    let active = true
    setLoading(true)
    void getWorkflowTemplate(templateId)
      .then((template) => {
        if (!active) return
        const meta = parsePlanMeta(template.planText)
        setSource(template.planText)
        setTitle(meta.title)
        setMode(meta.mode)
        setMaxConcurrency(meta.maxConcurrency)
        setTemplateTitle(template.title)
        setDirty(false)
      })
      .catch((cause) => active && setError(toErrorMessage(cause)))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [templateId, runId])

  useEffect(() => {
    if (!runId) return
    let active = true
    setLoading(true)
    void getRun(runId)
      .then((run) => {
        if (!active) return
        if (run.status !== 'draft') throw new Error('只有草稿 Run 可以编辑')
        const meta = parsePlanMeta(run.planText)
        setSource(run.planText)
        setTitle(meta.title)
        setMode(meta.mode)
        setMaxConcurrency(meta.maxConcurrency)
        setScheduledAt(run.scheduledAt)
        setScheduleMode(run.scheduledAt ? 'at' : 'now')
        setDirty(false)
      })
      .catch((cause) => active && setError(toErrorMessage(cause)))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [runId])

  useEffect(() => {
    if (loading) return
    const draft = readEditorDraft(scope)
    if (!draft) return
    if (draft.source.trim() === sourceRef.current.trim() && draft.scheduledAt === scheduledAt) {
      clearEditorDraft(scope)
      return
    }
    setRestorable(draft)
  }, [loading, scope])

  useEffect(() => {
    if (!dirty) return
    const timer = window.setTimeout(() => writeEditorDraft(scope, draftRef.current), 500)
    return () => window.clearTimeout(timer)
  }, [dirty, scope, source, title, mode, maxConcurrency, templateTitle, scheduledAt])

  // Route changes must never open a blocking dialog. Persist the latest local draft synchronously
  // when this editor unmounts, then let React Router navigate normally.
  useEffect(() => () => {
    if (dirtyRef.current) writeEditorDraft(scope, draftRef.current)
  }, [scope])

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      writeEditorDraft(scope, draftRef.current)
      event.preventDefault()
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [scope])

  function syncMeta(nextSource: string) {
    const meta = parsePlanMeta(nextSource)
    setTitle(meta.title)
    setMode(meta.mode)
    setMaxConcurrency(meta.maxConcurrency)
  }

  function onEditorChange(nextSource: string) {
    setSource(nextSource)
    syncMeta(nextSource)
    setDirty(true)
  }

  function restoreDraft() {
    if (!restorable) return
    const meta = parsePlanMeta(restorable.source)
    setSource(restorable.source)
    setTitle(meta.title)
    setMode(meta.mode)
    setMaxConcurrency(meta.maxConcurrency)
    setScheduledAt(restorable.scheduledAt)
    setScheduleMode(restorable.scheduledAt ? 'at' : 'now')
    if (restorable.templateTitle) setTemplateTitle(restorable.templateTitle)
    setDirty(true)
    setRestorable(null)
  }

  function discardDraft() {
    clearEditorDraft(scope)
    setRestorable(null)
  }

  async function persist(publish: boolean) {
    if (!session || saving) return
    if (errorCount > 0) {
      setError(`DSL 有 ${errorCount} 个错误，请先修复`)
      editorRef.current?.focus()
      return
    }
    if (scheduleUnresolved) {
      setError('请先选择执行时间')
      return
    }

    setSaving(true)
    setError('')
    try {
      const planText = source
      const schedule = scheduleEditable ? scheduledAt : ''

      if (templateMode === 'edit' && templateId) {
        await updateWorkflowTemplate(templateId, {
          title: templateTitle || title || '未命名模板',
          planText,
        })
        clearEditorDraft(scope)
        dirtyRef.current = false
        setDirty(false)
        navigate(`/templates/${templateId}`, { replace: true })
        return
      }

      const saved = runId
        ? await updateRunDraft(runId, planText, { publish, scheduledAt: schedule })
        : await createRun(planText, publish ? 'queued' : 'draft', schedule)

      clearEditorDraft(scope)
      dirtyRef.current = false
      setDirty(false)
      invalidateAsyncDataCache(`runs:${session.record.id}:`)
      invalidateAsyncDataCache(`run:${saved.id}:`)
      navigate(publish ? `/runs/${saved.id}` : `/runs/${saved.id}/edit`, { replace: true })
    } catch (cause) {
      setError(toErrorMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  if (!session) {
    return (
      <AppPage>
        <EmptyState title="未连接" action={<Button asChild><Link to="/settings">前往设置</Link></Button>} />
      </AppPage>
    )
  }

  if (loading) return <AppPage><LoadingState /></AppPage>

  const pageTitle = templateMode === 'edit'
    ? templateTitle || '编辑模板'
    : runId
      ? title || '未命名 Run'
      : templateMode === 'use'
        ? '使用模板'
        : '创建 Run'
  const scheduleSummary = describeSchedule(scheduleEditable ? scheduledAt : '', new Date(now))
  const runBlocked = saving || errorCount > 0 || scheduleUnresolved

  return (
    <AppPage className="max-w-[1380px] pb-28 sm:pb-16">
      <PageHeader
        title={pageTitle}
        actions={
          <div className="flex items-center gap-2">
            {errorCount > 0 ? <Badge variant="destructive" className="rounded-md">{errorCount} 错误</Badge> : null}
            <Badge variant={dirty ? 'warning' : 'secondary'} className="rounded-md">
              {dirty ? '未保存' : <><CircleCheck className="me-1 size-3" />已保存</>}
            </Badge>
          </div>
        }
      />

      {error ? <ErrorBanner>{error}</ErrorBanner> : null}

      {restorable ? (
        <div className="mb-3 flex flex-col gap-3 rounded-lg border border-info/25 bg-info-soft px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2.5">
            <History className="size-4 shrink-0 text-info" aria-hidden="true" />
            <p className="truncate text-[13px] font-medium">本地草稿 · {formatDateTime(new Date(restorable.savedAt).toISOString())}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" onClick={restoreDraft}>恢复</Button>
            <Button size="sm" variant="outline" onClick={discardDraft}>丢弃</Button>
          </div>
        </div>
      ) : null}

      {scheduleEditable ? (
        <div className="mb-3 rounded-lg border border-border bg-card px-3 py-2.5 sm:px-4">
          <SchedulePicker
            mode={scheduleMode}
            value={scheduledAt}
            onModeChange={(next) => changeSchedule({ mode: next })}
            onValueChange={(next) => changeSchedule({ value: next })}
            now={now}
          />
        </div>
      ) : null}

      <AnyWorkflowEditor
        ref={editorRef}
        value={source}
        onChange={onEditorChange}
        onSave={() => void persist(false)}
        downloadName={editorFileName(title)}
      />

      <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-border bg-background/96 px-3 pb-[calc(.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur md:static md:mt-3 md:justify-end md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
        {templateMode === 'edit' ? (
          <Button className="h-11 flex-1 md:h-9 md:flex-none" onClick={() => void persist(false)} disabled={saving || errorCount > 0}>
            <Save />{saving ? '保存中…' : '保存模板'}
          </Button>
        ) : (
          <>
            <Button className="h-11 flex-1 md:h-9 md:flex-none" variant="outline" onClick={() => void persist(false)} disabled={runBlocked}>
              <Save />{saving ? '保存中…' : '保存草稿'}
            </Button>
            <Button className="h-11 flex-1 md:h-9 md:flex-none" onClick={() => void persist(true)} disabled={runBlocked}>
              <Play />{saving ? '处理中…' : scheduleSummary.pending ? '安排执行' : '运行'}
            </Button>
          </>
        )}
      </div>
    </AppPage>
  )
}
