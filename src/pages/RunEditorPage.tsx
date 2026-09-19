import { CircleCheck, History, Play, Save } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { AnyWorkflowEditor, type AnyWorkflowEditorHandle } from '@/components/editor/AnyWorkflowEditor'
import { validateAnyWorkflowSource } from '@/components/editor/anyworkflow-dsl'
import { AppPage, EmptyState, ErrorBanner, Field, LoadingState, PageHeader, Panel, TextInput } from '@/components/app/ui'
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
import { toast } from 'sonner'

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
  const scope = draftScopeFor(session?.record.id, runId, templateId)

  const [source, setSource] = useState(createStarterPlan)
  const [templateTitle, setTemplateTitle] = useState('')
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('now')
  const [scheduledAt, setScheduledAt] = useState('')
  const [loading, setLoading] = useState(Boolean(runId || templateId))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [restorable, setRestorable] = useState<EditorDraft | null>(null)
  const now = useNow()

  const sourceRef = useRef(source)
  const templateTitleRef = useRef(templateTitle)
  const scheduledAtRef = useRef(scheduledAt)
  const dirtyRef = useRef(dirty)
  sourceRef.current = source
  templateTitleRef.current = templateTitle
  scheduledAtRef.current = scheduledAt
  dirtyRef.current = dirty

  const meta = useMemo(() => parsePlanMeta(source), [source])
  const diagnostics = useMemo(() => validateAnyWorkflowSource(source), [source])
  const errorCount = diagnostics.filter((item) => item.severity === 'error').length
  const scheduleEditable = templateMode !== 'edit'
  const scheduleUnresolved = scheduleEditable && scheduleMode !== 'now' && !scheduledAt

  function currentDraftPayload() {
    const currentMeta = parsePlanMeta(sourceRef.current)
    return {
      source: sourceRef.current,
      title: currentMeta.title,
      mode: currentMeta.mode,
      maxConcurrency: currentMeta.maxConcurrency,
      templateTitle: templateTitleRef.current,
      scheduledAt: scheduledAtRef.current,
    }
  }

  function saveLocalDraft() {
    if (dirtyRef.current) writeEditorDraft(scope, currentDraftPayload())
  }

  useEffect(() => {
    if (!templateId || runId) return
    let active = true
    setLoading(true)
    void getWorkflowTemplate(templateId)
      .then((template) => {
        if (!active) return
        setSource(template.planText)
        setTemplateTitle(template.title)
        setDirty(false)
        const draft = readEditorDraft(scope)
        if (draft && draft.source.trim() !== template.planText.trim()) setRestorable(draft)
        else if (draft) clearEditorDraft(scope)
      })
      .catch((cause) => active && setError(toErrorMessage(cause)))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [templateId, runId, scope])

  useEffect(() => {
    if (!runId) return
    let active = true
    setLoading(true)
    void getRun(runId)
      .then((run) => {
        if (!active) return
        if (run.status !== 'draft') throw new Error('只有草稿 Run 可以编辑')
        setSource(run.planText)
        setScheduledAt(run.scheduledAt)
        setScheduleMode(run.scheduledAt ? 'at' : 'now')
        setDirty(false)
        const draft = readEditorDraft(scope)
        if (draft && draft.source.trim() !== run.planText.trim()) setRestorable(draft)
        else if (draft) clearEditorDraft(scope)
      })
      .catch((cause) => active && setError(toErrorMessage(cause)))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [runId, scope])

  useEffect(() => {
    if (runId || templateId) return
    const draft = readEditorDraft(scope)
    if (draft && draft.source.trim() !== sourceRef.current.trim()) setRestorable(draft)
  }, [runId, scope, templateId])

  useEffect(() => {
    if (!dirty) return
    const timer = window.setTimeout(saveLocalDraft, 450)
    return () => window.clearTimeout(timer)
  }, [dirty, scope, source, templateTitle, scheduledAt])

  useEffect(() => {
    const flush = () => saveLocalDraft()
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [scope])

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

  function onEditorChange(nextSource: string) {
    setSource(nextSource)
    setDirty(true)
  }

  function restoreDraft() {
    if (!restorable) return
    setSource(restorable.source)
    setScheduledAt(restorable.scheduledAt)
    setScheduleMode(restorable.scheduledAt ? 'at' : 'now')
    if (restorable.templateTitle) setTemplateTitle(restorable.templateTitle)
    setDirty(true)
    setRestorable(null)
    toast.success('已恢复本地草稿')
  }

  function discardDraft() {
    clearEditorDraft(scope)
    setRestorable(null)
    toast.success('已丢弃本地草稿')
  }

  async function persist(publish: boolean) {
    if (!session || saving) return
    if (errorCount > 0) {
      setError(`DSL 有 ${errorCount} 个错误`)
      editorRef.current?.focus()
      return
    }
    if (scheduleUnresolved) {
      setError('请选择执行时间')
      return
    }

    setSaving(true)
    setError('')
    try {
      const planText = source
      const schedule = scheduleEditable ? scheduledAt : ''

      if (templateMode === 'edit' && templateId) {
        await updateWorkflowTemplate(templateId, { title: templateTitle || meta.title || '未命名模板', planText })
        dirtyRef.current = false
        clearEditorDraft(scope)
        setDirty(false)
        toast.success('模板已保存')
        navigate('/templates/' + templateId, { replace: true })
        return
      }

      const saved = runId
        ? await updateRunDraft(runId, planText, { publish, scheduledAt: schedule })
        : await createRun(planText, publish ? 'queued' : 'draft', schedule)

      dirtyRef.current = false
      clearEditorDraft(scope)
      setDirty(false)
      invalidateAsyncDataCache('runs:')
      invalidateAsyncDataCache(`run:${saved.id}`)
      toast.success(publish ? '工作流已提交执行' : '草稿已保存')
      navigate(publish ? `/runs/${saved.id}` : `/runs/${saved.id}/edit`, { replace: true })
    } catch (cause) {
      const message = toErrorMessage(cause)
      setError(message)
      toast.error('保存失败', { description: message })
    } finally {
      setSaving(false)
    }
  }

  if (!session) {
    return <AppPage><EmptyState title="未连接" action={<Button asChild variant="secondary"><Link to="/settings">设置连接</Link></Button>} /></AppPage>
  }
  if (loading) return <AppPage><LoadingState /></AppPage>

  const pageTitle = templateMode === 'edit' ? templateTitle || '编辑模板' : meta.title || (runId ? '未命名 Run' : '新建 Run')
  const scheduleSummary = describeSchedule(scheduleEditable ? scheduledAt : '', new Date(now))
  const blocked = saving || errorCount > 0 || scheduleUnresolved

  return (
    <AppPage className="max-w-[1360px] px-3 sm:px-5 lg:px-8">
      <PageHeader
        title={pageTitle}
        actions={
          <div className="flex items-center gap-2">
            {errorCount > 0 ? <Badge variant="destructive" className="rounded-md">{errorCount} 错误</Badge> : null}
            {dirty ? (
              <Badge variant="warning" className="rounded-md">本地草稿</Badge>
            ) : runId || templateMode === 'edit' ? (
              <Badge variant="secondary" className="rounded-md"><CircleCheck className="me-1 size-3" />已保存</Badge>
            ) : null}
          </div>
        }
      />

      {error ? <ErrorBanner>{error}</ErrorBanner> : null}

      {restorable ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-info/20 bg-info-soft px-3 py-2.5">
          <span className="flex min-w-0 items-center gap-2 text-xs"><History className="size-4 shrink-0 text-info" />本地草稿 · {formatDateTime(new Date(restorable.savedAt).toISOString())}</span>
          <span className="flex items-center gap-1.5"><Button size="sm" variant="secondary" onClick={restoreDraft}>恢复</Button><Button size="sm" variant="ghost" onClick={discardDraft}>丢弃</Button></span>
        </div>
      ) : null}

      {templateMode === 'edit' ? (
        <Panel className="mb-3 p-3">
          <Field label="模板名称"><TextInput name="template-title" value={templateTitle} maxLength={512} onChange={(event) => { setTemplateTitle(event.target.value); setDirty(true) }} /></Field>
        </Panel>
      ) : null}

      {scheduleEditable ? (
        <div className="mb-3 rounded-lg border border-border bg-card px-3 py-2.5">
          <SchedulePicker
            mode={scheduleMode}
            value={scheduledAt}
            onModeChange={(next) => changeSchedule({ mode: next })}
            onValueChange={(next) => changeSchedule({ value: next })}
            now={now}
            compact
          />
        </div>
      ) : null}

      <AnyWorkflowEditor ref={editorRef} value={source} onChange={onEditorChange} onSave={() => void persist(false)} downloadName={editorFileName(meta.title)} />

      <div className="mt-3 flex items-center justify-end gap-2 border-t border-border pt-3 sm:sticky sm:bottom-3 sm:z-20 sm:rounded-lg sm:border sm:bg-background/95 sm:p-2 sm:shadow-md sm:backdrop-blur">
        {templateMode === 'edit' ? (
          <Button variant="secondary" className="h-11 sm:h-9" onClick={() => void persist(false)} disabled={saving || errorCount > 0}><Save />{saving ? '保存中…' : '保存模板'}</Button>
        ) : (
          <>
            <Button className="h-11 sm:h-9" variant="outline" onClick={() => void persist(false)} disabled={blocked}><Save />保存草稿</Button>
            <Button className="h-11 sm:h-9" variant="secondary" onClick={() => void persist(true)} disabled={blocked}><Play />{scheduleSummary.pending ? '安排执行' : '运行'}</Button>
          </>
        )}
      </div>
    </AppPage>
  )
}
