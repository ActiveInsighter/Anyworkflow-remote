import { Braces, CircleCheck, Play, Save, SlidersHorizontal } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AppPage, EmptyState, ErrorBanner, Field, LoadingState, PageHeader, TextArea, TextInput } from '@/components/app/ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  const editorRows = useMemo(() => Math.min(30, Math.max(12, source.split('\n').length + 2)), [source])

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
        <EmptyState title="未连接" action={<Button asChild><Link to="/settings">连接</Link></Button>} />
      </AppPage>
    )
  }

  if (loading) return <AppPage><LoadingState /></AppPage>

  return (
    <AppPage className="max-w-[1320px]">
      <PageHeader
        eyebrow={runId ? '草稿' : '新建'}
        title={runId ? title || '未命名 Run' : '创建 Run'}
        actions={
          <Badge variant={dirty ? 'outline' : 'secondary'} className={cn('rounded-full px-3', dirty && 'border-amber-500/30 text-amber-600 dark:text-amber-400')}>
            {dirty ? '未保存' : <><CircleCheck className="mr-1 size-3" />已保存</>}
          </Badge>
        }
      />

      {error ? <ErrorBanner>{error}</ErrorBanner> : null}

      <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="lg:sticky lg:top-4">
          <CardHeader className="pb-4">
            <div className="mb-1 grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground">
              <SlidersHorizontal className="size-4" />
            </div>
            <CardTitle>Run 配置</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <Field label="名称">
              <TextInput
                value={title}
                maxLength={512}
                onChange={(event) => { setTitle(event.target.value); setDirty(true) }}
              />
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
              <Field label="最大并发">
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
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground">
                <Braces className="size-4" />
              </div>
              <CardTitle>Run DSL</CardTitle>
            </div>
            <Button size="sm" variant="ghost" onClick={readConfigFromSource}>读取配置</Button>
          </CardHeader>
          <CardContent>
            <TextArea
              rows={editorRows}
              className="code-editor resize-y rounded-lg border-zinc-800 bg-[#08090a] p-4 font-mono text-[12px] leading-6 text-zinc-100 focus-visible:border-zinc-700 focus-visible:ring-zinc-700/30 sm:text-[13px]"
              value={source}
              spellCheck={false}
              onChange={(event) => { setSource(event.target.value); setDirty(true) }}
              aria-label="Run DSL"
            />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 flex flex-col gap-2 border-t pt-4 sm:sticky sm:bottom-4 sm:z-20 sm:flex-row sm:justify-end sm:rounded-xl sm:border sm:bg-background/95 sm:p-3 sm:backdrop-blur">
        <Button variant="outline" onClick={() => void persist(false)} disabled={saving}>
          <Save />{saving ? '保存中…' : '保存草稿'}
        </Button>
        <Button onClick={() => void persist(true)} disabled={saving}>
          <Play />{saving ? '处理中…' : '开始运行'}
        </Button>
      </div>
    </AppPage>
  )
}
