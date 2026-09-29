import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Download, ExternalLink, FileText, LoaderCircle, Play, RefreshCw, Save } from 'lucide-react'
import { AppPage, PageHeader } from '@/components/app/ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useAsyncData } from '@/hooks/useAsyncData'
import {
  createPdfJob,
  DEFAULT_PDF_TO_MD_OPTIONS,
  getPdfConversionConfig,
  listPdfJobs,
  MAX_SYSTEM_PROMPT_CHARS,
  pdfDownloadUrl,
  pdfStatusLabels,
  savePdfConversionConfig,
  type FileConversionConfig,
  type PdfPageRange,
  type PdfConversionOptions,
  type PdfJob,
} from '@/lib/file-conversion'
import { ApiError } from '@/lib/pocketbase'

const numberFields = [
  ['images_per_request', '每次请求页数', 1, 20], ['concurrency', '并发请求数', 1, 100],
  ['dpi', '图像 DPI', 72, 300], ['jpeg_quality', 'JPEG 质量', 50, 100],
  ['verification_passes', '额外审校次数', 0, 3], ['rpm_per_key', '每 Key 每分钟请求数', 1, 1000],
  ['rpd_per_key', '每 Key 每日请求上限', 1, 100000],
] as const
type NumericOptionKey = typeof numberFields[number][0]
type NumericDraft = Record<NumericOptionKey, string>

function numberDrafts(options: PdfConversionOptions): NumericDraft {
  return Object.fromEntries(numberFields.map(([key]) => [key, String(options[key])])) as NumericDraft
}

function parseNumberDraft(key: NumericOptionKey, raw: string): { value: number } | { error: string } {
  const field = numberFields.find(([fieldKey]) => fieldKey === key)
  if (!field) return { error: '转换配置字段无效，请刷新重试' }
  const [, label, minimum, maximum] = field
  const value = Number(raw.trim())
  if (!raw.trim() || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    return { error: `${label}需填写 ${minimum}–${maximum} 的整数` }
  }
  return { value }
}

function readDraftOptions(options: PdfConversionOptions, drafts: NumericDraft): { value: PdfConversionOptions } | { error: string } {
  const next = { ...options }
  for (const [key] of numberFields) {
    const parsed = parseNumberDraft(key, drafts[key])
    if ('error' in parsed) return parsed
    next[key] = parsed.value
  }
  return { value: next }
}

function configErrorMessage(cause: unknown): string {
  if (cause instanceof ApiError && cause.status === 404) {
    return '后端转换配置表尚未部署，请先应用 migration 1790514100_file_conversion_configs。'
  }
  return cause instanceof Error ? cause.message : '配置加载失败，请刷新重试'
}

const choiceFields = [
  ['thinking_level', '思考深度', ['high', 'medium', 'low', 'minimal']],
  ['image_format', '图像格式', ['png', 'jpeg']],
  ['media_resolution', '视觉分辨率', ['ultra_high', 'high', 'medium', 'low', 'unspecified']],
] as const
const dateLabel = (value: string) => value ? new Date(value).toLocaleString() : '—'

export function PdfToMdPage() {
  const [page, setPage] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [downloading, setDownloading] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [config, setConfig] = useState<FileConversionConfig | null>(null)
  const [draftOptions, setDraftOptions] = useState<PdfConversionOptions>(DEFAULT_PDF_TO_MD_OPTIONS)
  const [draftSystemPrompt, setDraftSystemPrompt] = useState('')
  const [draftPageRange, setDraftPageRange] = useState<PdfPageRange>({})
  const [draftNumberText, setDraftNumberText] = useState<NumericDraft>(() => numberDrafts(DEFAULT_PDF_TO_MD_OPTIONS))
  const [configLoading, setConfigLoading] = useState(true)
  const [configSaving, setConfigSaving] = useState(false)
  const [configError, setConfigError] = useState('')
  const submission = useRef<{ id: string; payload: string } | null>(null)
  const busy = useRef(false)
  const jobs = useAsyncData((signal) => listPdfJobs(page, signal), [page], { pollMs: 5000 })

  useEffect(() => {
    let active = true
    void getPdfConversionConfig().then((saved) => {
      if (!active) return
      setConfig(saved)
      setDraftOptions(saved.options)
      setDraftSystemPrompt(saved.systemPrompt)
      setDraftNumberText(numberDrafts(saved.options))
      setConfigError('')
    }).catch((cause) => {
      if (active) setConfigError(configErrorMessage(cause))
    }).finally(() => {
      if (active) setConfigLoading(false)
    })
    return () => { active = false }
  }, [])

  function updateOption(key: keyof PdfConversionOptions, value: string | number | undefined) {
    setDraftOptions((current) => ({ ...current, [key]: value }))
  }

  function updatePageRange(key: keyof PdfPageRange, value: number | undefined) {
    setDraftPageRange((current) => ({ ...current, [key]: value }))
  }

  function updateNumberDraft(key: NumericOptionKey, value: string) {
    setDraftNumberText((current) => ({ ...current, [key]: value }))
    setError('')
  }

  function commitNumberDraft(key: NumericOptionKey, raw: string) {
    const parsed = parseNumberDraft(key, raw)
    if ('error' in parsed) {
      setError(parsed.error)
      return
    }
    setDraftOptions((current) => ({ ...current, [key]: parsed.value }))
    setDraftNumberText((current) => ({ ...current, [key]: String(parsed.value) }))
    setError('')
  }

  async function persistConfig(options: PdfConversionOptions = draftOptions, systemPrompt: string = draftSystemPrompt): Promise<FileConversionConfig> {
    setConfigSaving(true)
    try {
      const target = config || await getPdfConversionConfig()
      setConfig(target)
      const saved = await savePdfConversionConfig(target, options, systemPrompt)
      setConfig(saved)
      setDraftOptions(saved.options)
      // An emptied box comes back as the stored default, so the form always shows
      // the prompt that will actually be sent.
      setDraftSystemPrompt(saved.systemPrompt)
      setDraftNumberText(numberDrafts(saved.options))
      setConfigError('')
      setNotice(`配置已保存（版本 ${saved.revision}）。`)
      return saved
    } finally {
      setConfigSaving(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current || configLoading) return
    if (!config) { setError(configError || '转换配置尚未加载，请刷新重试'); return }
    const form = new FormData(event.currentTarget)
    const text = (key: string) => String(form.get(key) || '').trim()
    if (draftPageRange.end_page !== undefined && draftPageRange.start_page !== undefined && draftPageRange.end_page < draftPageRange.start_page) {
      setError('结束页不能小于起始页')
      return
    }
    const inputBase = { title: text('title'), sourceUrl: text('sourceUrl'), outputName: text('outputName'), prompt: text('prompt'), configId: config.id }
    const jobInput = {
      ...inputBase,
      ...(draftPageRange.start_page !== undefined ? { startPage: draftPageRange.start_page } : {}),
      ...(draftPageRange.end_page !== undefined ? { endPage: draftPageRange.end_page } : {}),
    }
    const payload = JSON.stringify({ ...jobInput, configRevision: config.revision })
    if (submission.current?.payload !== payload) submission.current = { id: crypto.randomUUID().replaceAll('-', '').slice(0, 15), payload }
    busy.current = true
    setSubmitting(true); setError(''); setNotice('')
    try {
      await createPdfJob(submission.current.id, jobInput)
      submission.current = null
      setNotice('任务已提交，状态会自动更新。')
      if (page !== 1) setPage(1)
      else await jobs.reload()
    } catch (cause) { setError(cause instanceof Error ? cause.message : '提交失败，请重试') }
    finally { busy.current = false; setSubmitting(false) }
  }

  async function saveConfig() {
    setError('')
    const parsedOptions = readDraftOptions(draftOptions, draftNumberText)
    if ('error' in parsedOptions) { setError(parsedOptions.error); return }
    try { await persistConfig(parsedOptions.value, draftSystemPrompt) } catch (cause) { setError(cause instanceof Error ? cause.message : '配置保存失败，请重试') }
  }

  async function download(job: PdfJob) {
    setDownloading(job.id); setError('')
    try {
      const response = await fetch(await pdfDownloadUrl(job))
      if (!response.ok) throw Error('下载失败，请刷新后重试')
      const blob = await response.blob()
      const href = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = href; link.download = `${job.outputName}.zip`
      document.body.append(link); link.click(); link.remove()
      window.setTimeout(() => URL.revokeObjectURL(href), 60000)
    } catch (cause) { setError(cause instanceof Error ? cause.message : '下载失败') }
    finally { setDownloading('') }
  }

    return <AppPage>
    <PageHeader title="文件转换" description="使用保存的参数处理文件；当前支持 PDF → Markdown，下载 ZIP 产物。" />
    <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
      <section className="min-w-0" aria-labelledby="pdf-create-title">
        <h2 id="pdf-create-title" className="mb-4 text-sm font-semibold">新建转换</h2>
        <p className="mb-4 text-xs text-muted-foreground" role="status">
          {configLoading ? '正在加载转换配置…' : configError ? configError : `配置已加载 · 版本 ${config?.revision ?? '—'}`}
        </p>
        <form id="pdf-create-form" onSubmit={submit}>
          <fieldset disabled={submitting || configLoading} className="min-w-0 space-y-4">
            <div className="space-y-2"><Label htmlFor="pdf-title">任务名称</Label><Input id="pdf-title" name="title" required maxLength={200} placeholder="例如：数学讲义" /></div>
            <div className="space-y-2"><Label htmlFor="pdf-source">PDF 源文件地址</Label><Input id="pdf-source" name="sourceUrl" type="url" required maxLength={4096} placeholder="https://…" aria-describedby="pdf-source-help" /><p id="pdf-source-help" className="text-xs text-muted-foreground">支持公开 PDF 直链或 Google Drive 分享链接。源 PDF 不存入文件库。</p></div>
            <div className="space-y-2"><Label htmlFor="pdf-output">产物文件名</Label><Input id="pdf-output" name="outputName" required maxLength={120} placeholder="例如：数学讲义-第一章" aria-describedby="pdf-name-help" /><p id="pdf-name-help" className="text-xs text-muted-foreground">自动添加 .zip；包内合并文档使用同名 .md。</p></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label htmlFor="pdf-start">起始页（可选）</Label><Input id="pdf-start" name="start_page" type="number" min={1} max={100000} step={1} placeholder="1" value={draftPageRange.start_page ?? ''} onChange={(event) => updatePageRange('start_page', event.target.value ? Number(event.target.value) : undefined)} /></div>
              <div className="space-y-2"><Label htmlFor="pdf-end">结束页（可选）</Label><Input id="pdf-end" name="end_page" type="number" min={1} max={100000} step={1} placeholder="末页" value={draftPageRange.end_page ?? ''} onChange={(event) => updatePageRange('end_page', event.target.value ? Number(event.target.value) : undefined)} /></div>
            </div>
            <div className="space-y-2"><Label htmlFor="pdf-prompt">转换要求（可选，本次任务专有）</Label><textarea id="pdf-prompt" name="prompt" maxLength={12000} rows={3} className="w-full resize-y rounded-md border border-input bg-transparent p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="会追加在系统提示词之后；留空则只发送系统提示词" aria-describedby="pdf-prompt-help" /><p id="pdf-prompt-help" className="text-xs text-muted-foreground">只对本次转换生效，与已保存的系统提示词按顺序拼接后一起发送。</p></div>
          </fieldset>
        </form>
        <fieldset disabled={configLoading || configSaving} className="mt-4 min-w-0">
          <details className="border-y border-border py-3">
            <summary className="cursor-pointer py-1 text-sm font-medium focus-visible:outline-ring">转换配置：系统提示词与高级参数（独立保存）</summary>
            <div className="mt-4 space-y-2">
              <Label htmlFor="pdf-system-prompt">系统提示词（所有任务共用）</Label>
              <textarea id="pdf-system-prompt" name="systemPrompt" maxLength={MAX_SYSTEM_PROMPT_CHARS} rows={10} value={draftSystemPrompt} onChange={(event) => { setDraftSystemPrompt(event.target.value); setError('') }} className="w-full resize-y rounded-md border border-input bg-transparent p-3 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-describedby="pdf-system-prompt-help" />
              <p id="pdf-system-prompt-help" className="text-xs text-muted-foreground">每次转换都会先发送这段提示词，再发送新建任务时填写的「转换要求」，两者按顺序拼接、互不覆盖。保存时留空会恢复内置默认提示词。当前 {draftSystemPrompt.length} / {MAX_SYSTEM_PROMPT_CHARS} 字符。</p>
            </div>
            <div className="mt-4 grid min-w-0 grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2"><Label htmlFor="pdf-model">Gemini 模型</Label><Input id="pdf-model" name="model" required value={draftOptions.model} maxLength={107} onChange={(event) => updateOption('model', event.target.value)} /></div>
              {numberFields.map(([key, label, minimum, maximum]) => <div key={key} className="min-w-0 space-y-2"><Label htmlFor={`pdf-${key}`}>{label}</Label><Input id={`pdf-${key}`} name={key} type="text" inputMode="numeric" pattern="[0-9]*" required value={draftNumberText[key]} onChange={(event) => updateNumberDraft(key, event.target.value)} onBlur={(event) => commitNumberDraft(key, event.currentTarget.value)} aria-describedby={key === 'concurrency' ? 'pdf-concurrency-help' : undefined} aria-invalid={Boolean(error && 'error' in parseNumberDraft(key, draftNumberText[key]))} />{key === 'concurrency' && <p id="pdf-concurrency-help" className="text-xs text-muted-foreground">允许 {minimum}–{maximum} 个并发请求</p>}</div>)}
              {choiceFields.map(([key, label, values]) => <div key={key} className="min-w-0 space-y-2"><Label htmlFor={`pdf-${key}`}>{label}</Label><Select id={`pdf-${key}`} name={key} value={draftOptions[key]} onChange={(event) => updateOption(key, event.target.value)} containerClassName="w-full">{values.map((value) => <option key={value} value={value}>{value}</option>)}</Select></div>)}
            </div>
          </details>
          <Button type="button" variant="outline" className="mt-4 min-h-10" onClick={() => void saveConfig()} disabled={configLoading || configSaving}><Save />{configSaving ? '保存中…' : '保存配置'}</Button>
        </fieldset>
        <Button form="pdf-create-form" type="submit" className="mt-4 min-h-11 w-full" disabled={submitting || configLoading || configSaving || !config || Boolean(configError)}>{submitting ? <LoaderCircle className="animate-spin" /> : <Play />}{submitting ? '提交中…' : '开始转换'}</Button>
        <p className="mt-2 text-xs text-muted-foreground">任务使用已保存的配置；修改高级参数后请先单独保存。</p>
        {notice && <p role="status" className="mt-3 text-sm text-success">{notice}</p>}
        {error && <p role="alert" className="mt-3 break-words text-sm text-danger">{error}</p>}
      </section>
      <section className="min-w-0" aria-labelledby="pdf-history-title">
        <div className="mb-2 flex items-center justify-between gap-3"><h2 id="pdf-history-title" className="text-sm font-semibold">转换记录 {jobs.data ? `(${jobs.data.totalItems})` : ''}</h2><Button variant="ghost" size="sm" onClick={() => void jobs.reload()} disabled={jobs.refreshing}><RefreshCw className={jobs.refreshing ? 'animate-spin' : ''} />刷新</Button></div>
        {jobs.error && <p role="alert" className="mb-3 text-sm text-danger">{jobs.error}</p>}
        {jobs.loading && <p role="status" className="py-10 text-sm text-muted-foreground">加载转换记录…</p>}
        {jobs.data?.items.length === 0 && <div className="border-y border-dashed border-border py-12 text-center text-muted-foreground"><FileText className="mx-auto mb-3 size-6" /><p className="text-sm">暂无转换记录</p></div>}
        <div className="divide-y divide-border">
          {jobs.data?.items.map((job) => <article key={job.id} className="min-w-0 py-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="min-w-0 break-all text-sm font-semibold">{job.title}</h3><span className={`shrink-0 rounded bg-muted px-2 py-1 text-xs ${job.status === 'succeeded' ? 'text-success' : job.status === 'failed' ? 'text-danger' : 'text-muted-foreground'}`}>{pdfStatusLabels[job.status] || job.status}</span></div>
            <p className="mt-1 break-all text-xs text-muted-foreground">{job.outputName}.zip{job.fileSize > 0 ? ` · ${(job.fileSize / 1024).toFixed(1)} KB` : ''}</p>
            <p className="mt-2 text-xs text-muted-foreground">提交于 {dateLabel(job.created)}</p>
            {job.error && <p className="mt-2 break-words text-xs text-danger">{job.error}</p>}
            <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer py-1 focus-visible:outline-ring">查看参数</summary><div className="mt-2 space-y-2 break-all"><p>{job.sourceUrl}</p>{job.prompt && <p>本次要求：{job.prompt}</p>}{job.systemPrompt && <p className="whitespace-pre-wrap">系统提示词：{job.systemPrompt}</p>}<dl className="grid grid-cols-2 gap-2">{Object.entries(job.options || {}).map(([key, value]) => <div key={key}><dt>{key}</dt><dd className="text-foreground">{value}</dd></div>)}</dl>{job.finishedAt && <p>结束于 {dateLabel(job.finishedAt)}</p>}</div></details>
            <div className="mt-3 flex flex-wrap gap-2">
              {job.file && <Button size="sm" className="min-h-10" disabled={Boolean(downloading)} onClick={() => void download(job)}>{downloading === job.id ? <LoaderCircle className="animate-spin" /> : <Download />}{downloading === job.id ? '下载中…' : '下载 ZIP'}</Button>}
              {/^[0-9]+$/.test(job.githubRunId) && <Button size="sm" variant="outline" className="min-h-10" asChild><a href={`https://github.com/ActiveInsighter/file-converter-ai/actions/runs/${job.githubRunId}`} target="_blank" rel="noreferrer"><ExternalLink />运行详情</a></Button>}
            </div>
          </article>)}
        </div>
        {jobs.data && jobs.data.totalPages > 1 && <nav aria-label="转换记录分页" className="mt-4 flex flex-wrap items-center justify-between gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button><span className="text-xs text-muted-foreground">{page} / {jobs.data.totalPages}</span><Button variant="outline" disabled={page >= jobs.data.totalPages} onClick={() => setPage(page + 1)}>下一页</Button></nav>}
      </section>
    </div>
  </AppPage>
}
