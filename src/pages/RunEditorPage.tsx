import { CircleCheck, History, Play, Save } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router'
import { AnyWorkflowEditor, type AnyWorkflowEditorHandle } from '@/components/editor/AnyWorkflowEditor'
import { validateAnyWorkflowSource } from '@/components/editor/anyworkflow-dsl'
import {
  AppPage,
  EmptyState,
  ErrorBanner,
  Field,
  LoadingState,
  PageHeader,
  Panel,
  Segmented,
  TextInput,
} from '@/components/app/ui'
import { SchedulePicker } from '@/components/app/schedule-picker'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createRun, getRun, toErrorMessage, updateRunDraft } from '@/lib/api'
import { clearEditorDraft, draftScopeFor, readEditorDraft, writeEditorDraft, type EditorDraft } from '@/lib/draft'
import { formatDateTime } from '@/lib/format'
import { getWorkflowTemplate, updateWorkflowTemplate } from '@/lib/library'
import { applyPlanMeta, createStarterPlan, parsePlanMeta } from '@/lib/plan'
import { DELAY_PRESETS, defaultScheduleTime, describeSchedule, resolveDelayPreset, toScheduledAt, type ScheduleMode } from '@/lib/schedule'
import { useNow } from '@/hooks/useNow'
import { useSession } from '@/lib/session'
import type { DispatchExecutionMode } from '@/types'

const modeOptions = [
  { value: 'serial' as DispatchExecutionMode, label: '串行' },
  { value: 'parallel' as DispatchExecutionMode, label: '并行' },
]

const UNSAFE_FILENAME = /[\\/:*?"<>|\u0000-\u001f]/gu

/** Keeps the downloaded plan recognisable without letting a title break the filename. */
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

  const scope = draftScopeFor(runId, templateId)

  const [source, setSource] = useState(createStarterPlan)
  const initialMeta = parsePlanMeta(source)
  const [title, setTitle] = useState(initialMeta.title)
  const [mode, setMode] = useState<DispatchExecutionMode>(initialMeta.mode)
  const [maxConcurrency, setMaxConcurrency] = useState(initialMeta.maxConcurrency)
  const [templateTitle, setTemplateTitle] = useState('')
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('now')
  const [scheduledAt, setScheduledAt] = useState('')
  const [loading, setLoading] = useState(Boolean(runId || templateId))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [restorable, setRestorable] = useState<EditorDraft | null>(null)
  const now = useNow()

  /** Templates carry no schedule, so the control only exists for Run drafts. */
  const scheduleEditable = templateMode !== 'edit'
  const scheduleUnresolved = scheduleEditable && scheduleMode !== 'now' && !scheduledAt

  function changeSchedule(next: { mode?: ScheduleMode; value?: string }) {
    if (next.mode !== undefined) {
      setScheduleMode(next.mode)
      // Switching mode always lands on a concrete instant, so the field is never left half-set.
      if (next.mode === 'now') setScheduledAt('')
      else if (next.mode === 'at') setScheduledAt(toScheduledAt(defaultScheduleTime()))
      else setScheduledAt((current) => current || toScheduledAt(resolveDelayPreset(DELAY_PRESETS[1])))
    }
    if (next.value !== undefined) setScheduledAt(next.value)
    setDirty(true)
  }

  const sourceRef = useRef(source)
  sourceRef.current = source

  const diagnostics = useMemo(() => validateAnyWorkflowSource(source), [source])
  const errorCount = diagnostics.filter((item) => item.severity === 'error').length

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

  /**
   * Offer the local draft once the server content is known. It is never applied automatically:
   * silently replacing what the server holds would be worse than losing an autosave.
   */
  useEffect(() => {
    if (loading) return
    const draft = readEditorDraft(scope)
    if (!draft) return
    if (draft.source.trim() === sourceRef.current.trim()) {
      clearEditorDraft(scope)
      return
    }
    setRestorable(draft)
  }, [loading, scope])

  useEffect(() => {
    if (!dirty) return
    const timer = window.setTimeout(() => {
      writeEditorDraft(scope, { source, title, mode, maxConcurrency, templateTitle, scheduledAt })
    }, 700)
    return () => window.clearTimeout(timer)
  }, [dirty, scope, source, title, mode, maxConcurrency, templateTitle, scheduledAt])

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault()
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty])

  /** Set just before a save-triggered navigation so the guard does not block our own redirect. */
  const bypassBlockRef = useRef(false)

  const blocker = useBlocker(useCallback(() => dirty && !bypassBlockRef.current, [dirty]))

  useEffect(() => {
    bypassBlockRef.current = false
  }, [runId, templateId])

  function stayOnPage() {
    if (blocker.state === 'blocked') blocker.reset()
  }

  function leavePage() {
    if (blocker.state === 'blocked') blocker.proceed()
  }

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

  function updateMeta(next: Partial<{ title: string; mode: DispatchExecutionMode; maxConcurrency: number }>) {
    const nextTitle = next.title ?? title
    const nextMode = next.mode ?? mode
    const nextConcurrency = next.maxConcurrency ?? maxConcurrency
    const nextSource = applyPlanMeta(source, {
      title: nextTitle,
      mode: nextMode,
      maxConcurrency: nextConcurrency,
    })
    setTitle(nextTitle)
    setMode(nextMode)
    setMaxConcurrency(nextMode === 'serial' ? 1 : nextConcurrency)
    setSource(nextSource)
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
      setError('DSL 有 ' + errorCount + ' 个错误，请先修复')
      editorRef.current?.focus()
      return
    }
    if (scheduleUnresolved) {
      setError('请先选择执行时刻或延时，再保存')
      return
    }

    setSaving(true)
    setError('')
    try {
      const planText = applyPlanMeta(source, { title, mode, maxConcurrency })
      const schedule = scheduleEditable ? scheduledAt : ''

      if (templateMode === 'edit' && templateId) {
        await updateWorkflowTemplate(templateId, {
          title: templateTitle || title || '未命名模板',
          planText,
        })
        clearEditorDraft(scope)
        setSource(planText)
        setDirty(false)
        bypassBlockRef.current = true
        navigate('/templates/' + templateId, { replace: true })
        return
      }

      const saved = runId
        ? await updateRunDraft(runId, planText, { publish, scheduledAt: schedule })
        : await createRun(planText, publish ? 'queued' : 'draft', schedule)

      clearEditorDraft(scope)
      setSource(planText)
      setDirty(false)
      bypassBlockRef.current = true
      navigate(publish ? '/runs/' + saved.id : '/runs/' + saved.id + '/edit', { replace: true })
    } catch (cause) {
      setError(toErrorMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  if (!session) {
    return (
      <AppPage>
        <EmptyState
          title="未连接"
          description="连接 AnyWorkflow 后端后才能创建 Run。"
          action={<Button asChild><Link to="/settings">前往设置</Link></Button>}
        />
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

  const pageDescription = templateMode === 'edit'
    ? '修改 DSL 并保存模板，不会创建新的 Run。'
    : '用 AnyWorkflow DSL 描述任务，保存为草稿或直接运行。'

  const scheduleSummary = describeSchedule(scheduleEditable ? scheduledAt : '', new Date(now))
  const runBlocked = saving || errorCount > 0 || scheduleUnresolved

  return (
    <AppPage className="max-w-[1320px]">
      <PageHeader
        eyebrow={
          <Link to={templateMode ? '/library?tab=templates' : '/'} className="outline-none hover:text-foreground focus-visible:underline">
            {templateMode ? '资料库' : '工作流'}
          </Link>
        }
        title={pageTitle}
        description={pageDescription}
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
        <div className="mb-3 flex flex-col gap-3 rounded-lg border bg-info-soft px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <History className="mt-0.5 size-4 shrink-0 text-info" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[13px] font-medium">发现上次未保存的本地草稿</p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                保存于 {formatDateTime(new Date(restorable.savedAt).toISOString())}。恢复后可继续编辑，服务端内容不会被自动覆盖。
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" onClick={restoreDraft}>恢复草稿</Button>
            <Button size="sm" variant="outline" onClick={discardDraft}>丢弃</Button>
          </div>
        </div>
      ) : null}

      <Panel className="mb-3 p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(200px,1.2fr)_minmax(200px,1fr)_190px_150px] xl:items-end">
          {templateMode === 'edit' ? (
            <>
              <Field label="模板名称">
                <TextInput
                  value={templateTitle}
                  maxLength={512}
                  onChange={(event) => {
                    setTemplateTitle(event.target.value)
                    setDirty(true)
                  }}
                />
              </Field>
              <Field label="Run 名称">
                <TextInput value={title} maxLength={512} onChange={(event) => updateMeta({ title: event.target.value })} />
              </Field>
            </>
          ) : (
            <>
              <Field label="名称">
                <TextInput value={title} maxLength={512} onChange={(event) => updateMeta({ title: event.target.value })} />
              </Field>
              <div className="hidden xl:block" aria-hidden="true" />
            </>
          )}

          <Field label="调度">
            <Segmented
              label="执行方式"
              value={mode}
              onChange={(next) =>
                updateMeta({ mode: next, maxConcurrency: next === 'serial' ? 1 : Math.max(2, maxConcurrency) })
              }
              options={modeOptions}
            />
          </Field>

          <Field label="最大并发">
            <TextInput
              type="number"
              min={1}
              max={16}
              disabled={mode !== 'parallel'}
              value={mode === 'parallel' ? maxConcurrency : 1}
              onChange={(event) =>
                updateMeta({ maxConcurrency: Math.max(1, Math.min(16, Number(event.target.value) || 1)) })
              }
            />
          </Field>
        </div>

        {scheduleEditable ? (
          <div className="mt-3.5 border-t border-border pt-3.5">
            <Field
              label="执行时间"
              hint="定时与延时写入的是同一个执行时刻。Run 一旦离开草稿，该时刻就不可修改——取消 Run 是唯一的撤回方式。"
            >
              <SchedulePicker
                mode={scheduleMode}
                value={scheduledAt}
                onModeChange={(next) => changeSchedule({ mode: next })}
                onValueChange={(next) => changeSchedule({ value: next })}
                now={now}
              />
            </Field>
          </div>
        ) : null}
      </Panel>

      <AnyWorkflowEditor
        ref={editorRef}
        value={source}
        onChange={onEditorChange}
        onSave={() => void persist(false)}
        downloadName={editorFileName(title)}
      />

      <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3 sm:sticky sm:bottom-3 sm:z-20 sm:flex-row sm:justify-end sm:gap-2 sm:rounded-lg sm:border sm:border-border sm:bg-background/95 sm:p-2 sm:shadow-md sm:backdrop-blur">
        {templateMode === 'edit' ? (
          <Button className="h-11 sm:h-9" onClick={() => void persist(false)} disabled={saving || errorCount > 0}>
            <Save />{saving ? '保存中…' : '保存模板'}
          </Button>
        ) : (
          <>
            <Button className="h-11 sm:h-9" variant="outline" onClick={() => void persist(false)} disabled={runBlocked}>
              <Save />{saving ? '保存中…' : '保存草稿'}
            </Button>
            <Button className="h-11 sm:h-9" onClick={() => void persist(true)} disabled={runBlocked}>
              <Play />
              {saving ? '处理中…' : scheduleSummary.pending ? '安排执行' : '立即运行'}
            </Button>
          </>
        )}
      </div>

      <AlertDialog open={blocker.state === 'blocked'} onOpenChange={(open) => { if (!open) stayOnPage() }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle>
            <AlertDialogDescription>
              当前 DSL 有未保存的修改，离开后服务端不会保存这些内容。本地已自动保留一份草稿，下次回到这个页面时可以恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={stayOnPage}>继续编辑</AlertDialogCancel>
            <AlertDialogAction onClick={leavePage}>放弃并离开</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppPage>
  )
}
