import { Braces, CircleCheck, Play, Save, SlidersHorizontal } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AppPage, EmptyState, ErrorBanner, Field, LoadingState, PageHeader, TextArea, TextInput } from '@/components/app/ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createRun, getRun, toErrorMessage, updateRunDraft } from '@/lib/api'
import { applyPlanMeta, createStarterPlan, parsePlanMeta } from '@/lib/plan'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'
import type { DispatchExecutionMode } from '@/types'

export function RunEditorPage() {
  const { runId } = useParams()
  const navigate = useNavigate()
  const session = useSession()
  const [source, setSource] = useState(() => createStarterPlan())
  const initialMeta = parsePlanMeta(source)
  const [title, setTitle] = useState(initialMeta.title)
  const [mode, setMode] = useState<DispatchExecutionMode>(initialMeta.mode)
  const [maxConcurrency, setMaxConcurrency] = useState(initialMeta.maxConcurrency)
  const [loading, setLoading] = useState(Boolean(runId))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)

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
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!dirty) return
      event.preventDefault()
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty])

  function normalizedSource(): string {
    return applyPlanMeta(source, { title, mode, maxConcurrency })
  }

  function readConfigFromSource() {
    const meta = parsePlanMeta(source)
    setTitle(meta.title)
    setMode(meta.mode)
    setMaxConcurrency(meta.maxConcurrency)
  }

  async function persist(publish: boolean) {
    if (!session || saving) return
    setSaving(true)
    setError('')
    try {
      const planText = normalizedSource()
      const saved = runId
        ? await updateRunDraft(runId, planText, publish)
        : await createRun(planText, publish ? 'queued' : 'draft')
      setSource(planText)
      setDirty(false)
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
        <EmptyState
          title="请先连接 AnyWorkflow"
          description="连接后才能创建和保存 Run。"
          action={<Button asChild><Link to="/settings">去连接</Link></Button>}
        />
      </AppPage>
    )
  }

  if (loading) return <AppPage><LoadingState label="正在读取草稿…" /></AppPage>

  return (
    <AppPage className="max-w-[1320px]">
      <PageHeader
        eyebrow={runId ? '编辑草稿' : '新建工作流'}
        title={runId ? title || '未命名 Run' : '创建 Run'}
        description="常用配置使用表单，完整能力仍保留在 Run DSL 中。"
        actions={
          <Badge variant={dirty ? 'outline' : 'secondary'} className={cn('rounded-full px-3', dirty && 'border-amber-500/30 text-amber-600 dark:text-amber-400')}>
            {dirty ? '有未保存修改' : <><CircleCheck className="mr-1 size-3" />已同步</>}
          </Badge>
        }
      />

      {error ? <ErrorBanner>{error}</ErrorBanner> : null}

      <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="lg:sticky lg:top-4">
          <CardHeader>
            <div className="mb-1 grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground">
              <SlidersHorizontal className="size-4" />
            </div>
            <CardTitle>Run 配置</CardTitle>
            <CardDescription>这些字段会同步写回 DSL 头部。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <Field label="名称">
              <TextInput
                value={title}
                maxLength={512}
                onChange={(event) => { setTitle(event.target.value); setDirty(true) }}
              />
            </Field>

            <Field label="任务调度">
              <div className="grid grid-cols-2 rounded-lg border bg-muted p-1">
                {([
                  ['serial', '串行'],
                  ['parallel', '并行'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={cn(
                      'h-8 rounded-md text-xs font-medium text-muted-foreground transition-all',
                      mode === value && 'bg-background text-foreground shadow-sm',
                    )}
                    onClick={() => {
                      setMode(value)
                      setMaxConcurrency(value === 'serial' ? 1 : Math.max(2, maxConcurrency))
                      setDirty(true)
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>

            {mode === 'parallel' ? (
              <Field label="最大并发" hint="与云端限制一致，范围 1–16。">
                <TextInput
                  type="number"
                  min={1}
                  max={16}
                  value={maxConcurrency}
                  onChange={(event) => {
                    setMaxConcurrency(Math.max(1, Math.min(16, Number(event.target.value) || 1)))
                    setDirty(true)
                  }}
                />
              </Field>
            ) : null}

            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="text-xs font-semibold">结构规则</div>
              <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">
                Run 只能包含 Task / For&lt;Task&gt;；Task 只能包含 Event / For&lt;Event&gt;。
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <div className="mb-2 grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground">
                <Braces className="size-4" />
              </div>
              <CardTitle>Run DSL</CardTitle>
              <CardDescription className="mt-1.5">完整工作流定义，表单和原文保持可双向同步。</CardDescription>
            </div>
            <Button size="sm" variant="ghost" onClick={readConfigFromSource}>读取配置</Button>
          </CardHeader>
          <CardContent>
            <TextArea
              className="code-editor min-h-[520px] resize-y rounded-lg border-zinc-800 bg-[#08090a] p-4 font-mono text-[12px] leading-6 text-zinc-100 shadow-inner focus-visible:border-zinc-700 focus-visible:ring-zinc-700/30 sm:text-[13px]"
              value={source}
              spellCheck={false}
              onChange={(event) => { setSource(event.target.value); setDirty(true) }}
              aria-label="Run DSL 原文"
            />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {['@task 名称 {', '@event 名称 {', '@for i in range(1, 3, 1) {', '%变量%'].map((hint) => (
                <code key={hint} className="rounded-md bg-muted px-2 py-1 text-[10px] text-muted-foreground">{hint}</code>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="sticky bottom-[84px] z-20 mt-4 flex flex-col gap-3 rounded-xl border bg-background/90 p-3 shadow-lg backdrop-blur sm:bottom-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="hidden min-w-0 sm:block">
          <div className="truncate text-xs font-semibold">{title || '未命名 Run'}</div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">{mode === 'parallel' ? `并行 · 最大 ${maxConcurrency}` : '串行执行'}</div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button variant="outline" onClick={() => void persist(false)} disabled={saving}>
            <Save />{saving ? '保存中…' : '保存草稿'}
          </Button>
          <Button onClick={() => void persist(true)} disabled={saving}>
            <Play />{saving ? '处理中…' : '开始运行'}
          </Button>
        </div>
      </div>
    </AppPage>
  )
}
