import { CalendarClock, CircleCheck, History, Play, Save } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { AnyWorkflowEditor, type AnyWorkflowEditorHandle } from '@/components/editor/AnyWorkflowEditor'
import { validateAnyWorkflowSource } from '@/components/editor/anyworkflow-dsl'
import { AppPage, EmptyState, Field, InlineError, LoadingState, Panel, TextInput } from '@/components/app/ui'
import { SchedulePicker } from '@/components/app/schedule-picker'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { invalidateAsyncDataCache } from '@/hooks/useAsyncData'
import { useNow } from '@/hooks/useNow'
import { ApiError, createEditedRun, createRun, getRun, toErrorMessage, updateRunDraft } from '@/lib/api'
import { clearEditorDraft, draftScopeFor, readEditorDraft, writeEditorDraft, type EditorDraft } from '@/lib/draft'
import { formatDateTime } from '@/lib/format'
import { getWorkflowTemplate, updateWorkflowTemplate } from '@/lib/library'
import { createStarterPlan, parsePlanMeta } from '@/lib/plan'
import {
  defaultScheduleTime,
  describeSchedule,
  isFutureScheduledAt,
  resolveDelay,
  toScheduledAt,
  type DelayUnit,
  type ScheduleMode,
} from '@/lib/schedule'
import { useSession } from '@/lib/session'
import { toast } from 'sonner'
import type { DispatchRunRecord } from '@/types'

function editorSaveErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status >= 500 &&
      /something went wrong while processing your request/iu.test(error.message)) {
    return `服务端处理失败（HTTP ${error.status}），本次保存结果未能确认；请先刷新 Run 列表确认结果，再决定是否重试。`
  }
  return toErrorMessage(error)
}

export function RunEditorPage() {
  const location = useLocation()
  // Remount on editor scope changes so local drafts and async loads cannot leak across Runs.
  return <RunEditorForm key={location.pathname + location.search} />
}

function RunEditorForm() {
  const { runId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const templateId = searchParams.get('templateId') || ''
  const templateMode = searchParams.get('mode') === 'edit' ? 'edit' : templateId ? 'use' : ''
  const session = useSession()
  const editorRef = useRef<AnyWorkflowEditorHandle | null>(null)
  const scope = draftScopeFor(session?.record.id, runId, templateId)

  const [loadedRun, setLoadedRun] = useState<DispatchRunRecord | null>(null)
  const [source, setSource] = useState(createStarterPlan)
  const [templateTitle, setTemplateTitle] = useState('')
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('now')
  const [scheduledAt, setScheduledAt] = useState('')
  const [delayAmount, setDelayAmount] = useState('1')
  const [delayUnit, setDelayUnit] = useState<DelayUnit>('hour')
  const [scheduleOpen, setScheduleOpen] = useState(false)
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
  const scheduleInvalid =
    scheduleEditable &&
    scheduleMode !== 'now' &&
    (!scheduledAt || !isFutureScheduledAt(scheduledAt, new Date(now)))

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
        if (!['draft', 'succeeded', 'failed', 'canceled'].includes(run.status)) throw new Error('进行中的 Run 不能编辑，请等待执行结束')
        setLoadedRun(run)
        const initialSchedule = run.status === 'draft' ? run.scheduledAt : ''
        setSource(run.planText)
        setScheduledAt(initialSchedule)
        setScheduleMode(initialSchedule ? 'at' : 'now')
        setDirty(false)
        const draft = readEditorDraft(scope)
        if (draft && (draft.source !== run.planText || draft.scheduledAt !== initialSchedule)) setRestorable(draft)
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

  function updateDelay(amountText: string, unit: DelayUnit = delayUnit) {
    setDelayAmount(amountText)
    setDelayUnit(unit)
    const amount = Number(amountText)
    if (!Number.isSafeInteger(amount) || amount < 1) {
      setScheduledAt('')
    } else {
      setScheduledAt(toScheduledAt(resolveDelay(amount, unit, new Date(now))))
    }
    setDirty(true)
  }

  function changeSchedule(next: { mode?: ScheduleMode; value?: string }) {
    if (next.mode !== undefined) {
      setScheduleMode(next.mode)
      if (next.mode === 'now') {
        setScheduledAt('')
      } else if (next.mode === 'at') {
        setScheduledAt(toScheduledAt(defaultScheduleTime(new Date(now))))
      } else {
        const amount = Number(delayAmount)
        const safeAmount = Number.isSafeInteger(amount) && amount >= 1 ? amount : 1
        if (safeAmount !== amount) setDelayAmount(String(safeAmount))
        setScheduledAt(toScheduledAt(resolveDelay(safeAmount, delayUnit, new Date(now))))
      }
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
    if (!session || saving || loading || (runId && !loadedRun)) return
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
        ? loadedRun?.status === 'draft'
          ? await updateRunDraft(runId, planText, { publish, scheduledAt: schedule })
          : await createEditedRun(runId, planText, publish ? 'queued' : 'draft', schedule)
        : await createRun(planText, publish ? 'queued' : 'draft', schedule)

      dirtyRef.current = false
      clearEditorDraft(scope)
      setDirty(false)
      invalidateAsyncDataCache('runs:')
      invalidateAsyncDataCache(`run-family:${saved.familyId}`)
      invalidateAsyncDataCache(`run:${saved.id}`)
      toast.success(publish ? '工作流已提交执行' : '草稿已保存')
      navigate(publish ? `/runs/${saved.id}` : `/runs/${saved.id}/edit`, { replace: true })
    } catch (cause) {
      const message = editorSaveErrorMessage(cause)
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
  if (runId && !loadedRun) return <AppPage><InlineError>{error || '无法加载 Run'}</InlineError><Button asChild variant="outline" className="mt-3"><Link to={`/runs/${runId}`}>返回 Run</Link></Button></AppPage>
  const editingCompleted = Boolean(loadedRun && loadedRun.status !== 'draft')

  const pageTitle = templateMode === 'edit' ? templateTitle || '编辑模板' : meta.title || (runId ? '未命名 Run' : '新建 Run')
  const scheduleSummary = describeSchedule(scheduleEditable ? scheduledAt : '', new Date(now))
  const blocked = saving || errorCount > 0 || scheduleInvalid
  const delayUnitLabel = delayUnit === 'minute' ? '分钟' : delayUnit === 'hour' ? '小时' : '天'
  const scheduleButtonLabel =
    scheduleMode === 'now'
      ? '立即'
      : scheduleMode === 'at'
        ? '定时'
        : `${delayAmount || 1}${delayUnitLabel}后`

  return (
    <AppPage className="aw-run-editor-page flex min-h-0 flex-1 flex-col overflow-hidden max-w-[1360px] px-3 pb-[calc(8px+env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pb-3 sm:pt-4 lg:px-8">
      <div className="mb-2 flex min-w-0 shrink-0 items-center gap-2 px-0.5">
        <h1 className="min-w-0 truncate text-[21px] font-semibold tracking-[-0.03em] sm:text-[24px]">{pageTitle}</h1>
        {dirty ? (
          <Badge variant="warning" className="shrink-0 rounded-md">本地草稿</Badge>
        ) : editingCompleted ? (
          <Badge variant="secondary" className="shrink-0 rounded-md">未保存</Badge>
        ) : runId || templateMode === 'edit' ? (
          <Badge variant="secondary" className="shrink-0 rounded-md"><CircleCheck className="me-1 size-3" />已保存</Badge>
        ) : null}
        {errorCount > 0 ? <Badge variant="destructive" className="shrink-0 rounded-md">{errorCount} 错误</Badge> : null}
      </div>

      {editingCompleted ? <p className="mb-2 text-xs text-muted-foreground">基于 v{loadedRun?.versionMajor}.{loadedRun?.versionMinor} 编辑，保存或运行时创建新大版本。</p> : null}

      {error ? <div className="mb-2 shrink-0"><InlineError>{error}</InlineError></div> : null}

      {restorable ? (
        <div className="mb-2 flex shrink-0 items-center justify-between gap-2 rounded-md border border-info/20 bg-info-soft px-3 py-2">
          <span className="flex min-w-0 items-center gap-2 truncate text-xs">
            <History className="size-4 shrink-0 text-info" />
            <span className="truncate">本地草稿 · {formatDateTime(new Date(restorable.savedAt).toISOString())}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <Button size="sm" variant="secondary" onClick={restoreDraft}>恢复</Button>
            <Button size="sm" variant="ghost" onClick={discardDraft}>丢弃</Button>
          </span>
        </div>
      ) : null}

      {templateMode === 'edit' ? (
        <Panel className="mb-2 shrink-0 p-2.5">
          <Field label="模板名称">
            <TextInput
              name="template-title"
              value={templateTitle}
              maxLength={512}
              onChange={(event) => {
                setTemplateTitle(event.target.value)
                setDirty(true)
              }}
            />
          </Field>
        </Panel>
      ) : null}

      <AnyWorkflowEditor
        ref={editorRef}
        value={source}
        onChange={onEditorChange}
        onSave={() => void persist(false)}
        className="h-auto min-h-0 flex-1 sm:h-auto sm:min-h-0"
      />

      <div className="mt-2 flex shrink-0 items-center gap-2 border-t border-border pt-2">
        {scheduleEditable ? (
          <Button
            type="button"
            variant="outline"
            className="h-10 shrink-0 px-2.5 text-xs"
            onClick={() => setScheduleOpen(true)}
            aria-haspopup="dialog"
            title={scheduleSummary.pending ? `${scheduleSummary.absolute} · ${scheduleSummary.relative}` : '设置执行时间'}
          >
            <CalendarClock className="size-4" />
            {scheduleButtonLabel}
          </Button>
        ) : null}

        <div className="ms-auto flex min-w-0 items-center gap-2">
          {templateMode === 'edit' ? (
            <Button
              variant="secondary"
              className="h-10 shrink-0"
              onClick={() => void persist(false)}
              disabled={saving || errorCount > 0}
            >
              <Save />
              {saving ? '保存中…' : '保存模板'}
            </Button>
          ) : (
            <>
              <Button
                className="h-10 shrink-0 px-3"
                variant="outline"
                onClick={() => void persist(false)}
                disabled={blocked}
              >
                <Save />
                <span className="sm:hidden">保存</span>
                <span className="hidden sm:inline">保存草稿</span>
              </Button>
              <Button
                className="h-10 shrink-0 px-3"
                variant="secondary"
                onClick={() => void persist(true)}
                disabled={blocked}
              >
                <Play />
                {scheduleSummary.pending ? '安排' : '运行'}
              </Button>
            </>
          )}
        </div>
      </div>

      {scheduleEditable ? (
        <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>执行计划</DialogTitle>
              <DialogDescription>选择立即运行，或设置一个未来的定时 / 延时执行时间。</DialogDescription>
            </DialogHeader>
            <SchedulePicker
              mode={scheduleMode}
              value={scheduledAt}
              onModeChange={(next) => changeSchedule({ mode: next })}
              onValueChange={(next) => changeSchedule({ value: next })}
              delayAmount={delayAmount}
              delayUnit={delayUnit}
              onDelayAmountChange={(next) => updateDelay(next)}
              onDelayUnitChange={(next) => updateDelay(delayAmount, next)}
              now={now}
            />
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setScheduleOpen(false)}>完成</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </AppPage>
  )
}
