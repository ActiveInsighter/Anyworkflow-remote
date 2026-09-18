import { CircleCheck, Play, Save } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createRun, getRun, toErrorMessage, updateRunDraft } from '@/lib/api'
import { getWorkflowTemplate, updateWorkflowTemplate } from '@/lib/library'
import { applyPlanMeta, createStarterPlan, parsePlanMeta } from '@/lib/plan'
import { useSession } from '@/lib/session'
import type { DispatchExecutionMode } from '@/types'

const modeOptions = [
  { value: 'serial' as DispatchExecutionMode, label: '串行' },
  { value: 'parallel' as DispatchExecutionMode, label: '并行' },
]

export function RunEditorPage() {
  const { runId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const templateId = searchParams.get('templateId') || ''
  const templateMode = searchParams.get('mode') === 'edit' ? 'edit' : templateId ? 'use' : ''
  const session = useSession()
  const editorRef = useRef<AnyWorkflowEditorHandle | null>(null)

  const [source, setSource] = useState(createStarterPlan)
  const initialMeta = parsePlanMeta(source)
  const [title, setTitle] = useState(initialMeta.title)
  const [mode, setMode] = useState<DispatchExecutionMode>(initialMeta.mode)
  const [maxConcurrency, setMaxConcurrency] = useState(initialMeta.maxConcurrency)
  const [templateTitle, setTemplateTitle] = useState('')
  const [loading, setLoading] = useState(Boolean(runId || templateId))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)

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
        setDirty(false)
      })
      .catch((cause) => active && setError(toErrorMessage(cause)))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [runId])

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault()
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty])

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

  async function persist(publish: boolean) {
    if (!session || saving) return
    if (errorCount > 0) {
      setError('DSL 有 ' + errorCount + ' 个错误，请先修复')
      editorRef.current?.focus()
      return
    }

    setSaving(true)
    setError('')
    try {
      const planText = applyPlanMeta(source, { title, mode, maxConcurrency })

      if (templateMode === 'edit' && templateId) {
        await updateWorkflowTemplate(templateId, {
          title: templateTitle || title || '未命名模板',
          planText,
        })
        setSource(planText)
        setDirty(false)
        navigate('/templates/' + templateId, { replace: true })
        return
      }

      const saved = runId
        ? await updateRunDraft(runId, planText, publish)
        : await createRun(planText, publish ? 'queued' : 'draft')

      setSource(planText)
      setDirty(false)
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
      </Panel>

      <AnyWorkflowEditor
        ref={editorRef}
        value={source}
        onChange={onEditorChange}
        onSave={() => void persist(false)}
      />

      <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3 sm:sticky sm:bottom-3 sm:z-20 sm:flex-row sm:justify-end sm:gap-2 sm:rounded-lg sm:border sm:border-border sm:bg-background/95 sm:p-2 sm:shadow-md sm:backdrop-blur">
        {templateMode === 'edit' ? (
          <Button onClick={() => void persist(false)} disabled={saving || errorCount > 0}>
            <Save />{saving ? '保存中…' : '保存模板'}
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={() => void persist(false)} disabled={saving || errorCount > 0}>
              <Save />{saving ? '保存中…' : '保存草稿'}
            </Button>
            <Button onClick={() => void persist(true)} disabled={saving || errorCount > 0}>
              <Play />{saving ? '处理中…' : '开始运行'}
            </Button>
          </>
        )}
      </div>
    </AppPage>
  )
}
