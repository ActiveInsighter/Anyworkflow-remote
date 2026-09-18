import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Button, Card, ErrorBanner, Field, LoadingState, PageHeader, TextArea, TextInput } from '../components/ui'
import { createRun, getRun, toErrorMessage, updateRunDraft } from '../lib/api'
import { applyPlanMeta, createStarterPlan, parsePlanMeta } from '../lib/plan'
import { useSession } from '../lib/session'
import type { DispatchExecutionMode } from '../types'

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
      <Card className="empty-state">
        <h2>请先连接 AnyWorkflow</h2>
        <p>连接后才能创建和保存 Run。</p>
        <Link className="button button-primary" to="/settings">去连接</Link>
      </Card>
    )
  }

  if (loading) return <LoadingState label="正在读取草稿…" />

  return (
    <>
      <PageHeader
        eyebrow={runId ? '编辑草稿' : '新建工作流'}
        title={runId ? title || '未命名 Run' : '创建 Run'}
        description="网页端沿用小程序的 Run DSL，同时把常用配置拆成表单，减少直接改指令的负担。"
        actions={<span className={dirty ? 'save-indicator dirty' : 'save-indicator'}>{dirty ? '有未保存修改' : '已同步'}</span>}
      />

      {error ? <ErrorBanner>{error}</ErrorBanner> : null}

      <div className="editor-layout">
        <Card className="editor-settings">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Run 配置</span>
              <h2>运行方式</h2>
            </div>
          </div>

          <Field label="名称">
            <TextInput
              value={title}
              maxLength={512}
              onChange={(event) => { setTitle(event.target.value); setDirty(true) }}
            />
          </Field>

          <Field label="任务调度">
            <div className="segmented">
              <button
                type="button"
                className={mode === 'serial' ? 'active' : ''}
                onClick={() => { setMode('serial'); setMaxConcurrency(1); setDirty(true) }}
              >
                串行
              </button>
              <button
                type="button"
                className={mode === 'parallel' ? 'active' : ''}
                onClick={() => { setMode('parallel'); setMaxConcurrency(Math.max(2, maxConcurrency)); setDirty(true) }}
              >
                并行
              </button>
            </div>
          </Field>

          {mode === 'parallel' ? (
            <Field label="最大并发" hint="与小程序和云端限制一致，范围 1–16。">
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

          <div className="editor-note">
            <strong>结构规则</strong>
            <span>Run 只能包含 Task / For&lt;Task&gt;；Task 只能包含 Event / For&lt;Event&gt;。</span>
          </div>
        </Card>

        <Card className="editor-source-card">
          <div className="editor-toolbar">
            <div>
              <span className="eyebrow">Run DSL</span>
              <h2>队列原文</h2>
            </div>
            <Button variant="ghost" onClick={readConfigFromSource}>从原文读取配置</Button>
          </div>

          <TextArea
            className="code-editor"
            value={source}
            spellCheck={false}
            onChange={(event) => { setSource(event.target.value); setDirty(true) }}
            aria-label="Run DSL 原文"
          />

          <div className="syntax-hints">
            <code>@task 名称 {'{'}</code>
            <code>@event 名称 {'{'}</code>
            <code>@for i in range(1, 3, 1) {'{'}</code>
            <code>%变量%</code>
          </div>
        </Card>
      </div>

      <div className="sticky-actions">
        <div>
          <strong>{title || '未命名 Run'}</strong>
          <span>{mode === 'parallel' ? `并行 · 最大 ${maxConcurrency}` : '串行执行'}</span>
        </div>
        <div className="sticky-buttons">
          <Button variant="secondary" onClick={() => void persist(false)} disabled={saving}>
            {saving ? '保存中…' : '保存草稿'}
          </Button>
          <Button variant="primary" onClick={() => void persist(true)} disabled={saving}>
            {saving ? '处理中…' : '开始运行'}
          </Button>
        </div>
      </div>
    </>
  )
}
