import { CircleCheck, Play, Save, SlidersHorizontal } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { AnyWorkflowEditor, type AnyWorkflowEditorHandle } from '@/components/editor/AnyWorkflowEditor'
import { validateAnyWorkflowSource } from '@/components/editor/anyworkflow-dsl'
import { AppPage, EmptyState, ErrorBanner, Field, LoadingState, PageHeader, TextInput } from '@/components/app/ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createRun, getRun, toErrorMessage, updateRunDraft } from '@/lib/api'
import { getWorkflowTemplate, updateWorkflowTemplate } from '@/lib/library'
import { applyPlanMeta, createStarterPlan, parsePlanMeta } from '@/lib/plan'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'
import type { DispatchExecutionMode } from '@/types'

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
    return <AppPage><EmptyState title="未连接" action={<Button asChild><Link to="/settings">连接</Link></Button>} /></AppPage>
  }

  if (loading) return <AppPage><LoadingState /></AppPage>

  const pageTitle = templateMode === 'edit'
    ? templateTitle || '编辑模板'
    : runId
      ? title || '未命名 Run'
      : templateMode === 'use'
        ? '使用模板'
        : '创建 Run'

  return (
    <AppPage className="max-w-[1440px]">
      <PageHeader
        eyebrow={templateMode === 'edit' ? '模板' : runId ? '草稿' : templateMode === 'use' ? '模板' : '新建'}
        title={pageTitle}
        actions={
          <div className="flex items-center gap-2">
            {errorCount > 0 ? <Badge variant="destructive" className="rounded-full px-3">{errorCount} 错误</Badge> : null}
            <Badge variant={dirty ? 'outline' : 'secondary'} className={cn('rounded-full px-3', dirty && 'border-amber-500/30 text-amber-600 dark:text-amber-400')}>
              {dirty ? '未保存' : <><CircleCheck className="mr-1 size-3" />已保存</>}
            </Badge>
          </div>
        }
      />

      {error ? <ErrorBanner>{error}</ErrorBanner> : null}

      <div className="grid items-start gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="xl:sticky xl:top-4">
          <CardHeader className="pb-4">
            <div className="mb-1 grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground">
              <SlidersHorizontal className="size-4" />
            </div>
            <CardTitle>Run 配置</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            {templateMode === 'edit' ? (
              <Field label="模板名称">
                <TextInput value={templateTitle} maxLength={512} onChange={(event) => { setTemplateTitle(event.target.value); setDirty(true) }} />
              </Field>
            ) : null}

            <Field label="名称">
              <TextInput value={title} maxLength={512} onChange={(event) => updateMeta({ title: event.target.value })} />
            </Field>

            <Field label="调度">
              <div className="grid grid-cols-2 rounded-lg border bg-muted p-1">
                {([
                  ['serial', '串行'],
                  ['parallel', '并行'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={cn(
                      'h-9 rounded-md text-sm font-medium text-muted-foreground transition-colors',
                      mode === value && 'bg-background text-foreground',
                    )}
                    onClick={() => updateMeta({
                      mode: value,
                      maxConcurrency: value === 'serial' ? 1 : Math.max(2, maxConcurrency),
                    })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>

            {mode === 'parallel' ? (
              <Field label="最大并发">
                <TextInput
                  type="number"
                  min={1}
                  max={16}
                  value={maxConcurrency}
                  onChange={(event) => updateMeta({
                    maxConcurrency: Math.max(1, Math.min(16, Number(event.target.value) || 1)),
                  })}
                />
              </Field>
            ) : null}

            <div className="grid gap-2 rounded-lg border bg-muted/20 p-3 text-[11px] text-muted-foreground">
              <div className="flex justify-between gap-4"><span>补全</span><kbd>Ctrl/⌘ + Space</kbd></div>
              <div className="flex justify-between gap-4"><span>搜索</span><kbd>Ctrl/⌘ + F</kbd></div>
              <div className="flex justify-between gap-4"><span>保存</span><kbd>Ctrl/⌘ + S</kbd></div>
              <div className="flex justify-between gap-4"><span>提示词</span><kbd>/</kbd></div>
            </div>
          </CardContent>
        </Card>

        <AnyWorkflowEditor
          ref={editorRef}
          value={source}
          onChange={onEditorChange}
          onSave={() => void persist(false)}
        />
      </div>

      <div className="mt-4 flex flex-col gap-2 border-t pt-4 sm:sticky sm:bottom-4 sm:z-20 sm:flex-row sm:justify-end sm:rounded-xl sm:border sm:bg-background/95 sm:p-3 sm:backdrop-blur">
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
