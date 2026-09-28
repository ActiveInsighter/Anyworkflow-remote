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
  pdfDownloadUrl,
  pdfStatusLabels,
  savePdfConversionConfig,
  type FileConversionConfig,
  type PdfConversionOptions,
  type PdfJob,
} from '@/lib/file-conversion'

const numberFields = [
  ['images_per_request', '每次请求页数', 1, 20], ['concurrency', '并发请求数', 1, 16],
  ['dpi', '图像 DPI', 72, 300], ['jpeg_quality', 'JPEG 质量', 50, 100],
  ['verification_passes', '额外审校次数', 0, 3], ['rpm_per_key', '每 Key 每分钟请求数', 1, 1000],
  ['rpd_per_key', '每 Key 每日请求上限', 1, 100000],
] as const
const choiceFields = [
  ['thinking_level', '思考深度', ['high', 'medium', 'low', 'minimal']],
  ['image_format', '图像格式', ['png', 'jpeg']],
  ['media_resolution', '视觉分辨率', ['ultra_high', 'high', 'medium', 'low', 'unspecified']],
] as const
const dateLabel = (value: string) => value ? new Date(value).toLocaleString() : '—'

function sameOptions(left: PdfConversionOptions, right: PdfConversionOptions): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function PdfToMdPage() {
  const [page, setPage] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [downloading, setDownloading] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [config, setConfig] = useState<FileConversionConfig | null>(null)
  const [draftOptions, setDraftOptions] = useState<PdfConversionOptions>(DEFAULT_PDF_TO_MD_OPTIONS)
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
      setConfigError('')
    }).catch((cause) => {
      if (active) setConfigError(cause instanceof Error ? cause.message : '配置加载失败，请刷新重试')
    }).finally(() => {
      if (active) setConfigLoading(false)
    })
    return () => { active = false }
  }, [])

  function updateOption(key: keyof PdfConversionOptions, value: string | number | undefined) {
    setDraftOptions((current) => ({ ...current, [key]: value }))
  }

  async function persistConfig(): Promise<FileConversionConfig> {
    if (!config) throw Error('转换配置尚未加载，请稍候')
    setConfigSaving(true)
    try {
      const saved = await savePdfConversionConfig(config, draftOptions)
      setConfig(saved)
      setDraftOptions(saved.options)
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
    if (draftOptions.end_page !== undefined && draftOptions.start_page !== undefined && draftOptions.end_page < draftOptions.start_page) {
      setError('结束页不能小于起始页')
      return
    }
    const inputBase = { title: text('title'), sourceUrl: text('sourceUrl'), outputName: text('outputName'), prompt: text('prompt'), configId: config.id }
    const payload = JSON.stringify({ ...inputBase, options: draftOptions })
    if (submission.current?.payload !== payload) submission.current = { id: crypto.randomUUID().replaceAll('-', '').slice(0, 15), payload }
    busy.current = true
    setSubmitting(true); setError(''); setNotice('')
    try {
      const savedConfig = sameOptions(config.options, draftOptions) ? config : await persistConfig()
      await createPdfJob(submission.current.id, { ...inputBase, configId: savedConfig.id })
      submission.current = null
      setNotice('配置已保存，任务已提交，状态会自动更新。')
      if (page !== 1) setPage(1)
      else await jobs.reload()
    } catch (cause) { setError(cause instanceof Error ? cause.message : '提交失败，请重试') }
    finally { busy.current = false; setSubmitting(false) }
  }

  async function saveAdvancedOptions() {
    setError('')
    try { await persistConfig() } catch (cause) { setError(cause instanceof Error ? cause.message : '配置保存失败，请重试') }
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
        <form onSubmit={submit}>
          <fieldset disabled={submitting || configLoading || configSaving} className="min-w-0 space-y-4">
            <div className="space-y-2"><Label htmlFor="pdf-title">任务名称</Label><Input id="pdf-title" name="title" required maxLength={200} placeholder="例如：数学讲义" /></div>
            <div className="space-y-2"><Label htmlFor="pdf-source">PDF 源文件地址</Label><Input id="pdf-source" name="sourceUrl" type="url" required maxLength={4096} placeholder="https://…" aria-describedby="pdf-source-help" /><p id="pdf-source-help" className="text-xs text-muted-foreground">支持公开 PDF 直链或 Google Drive 分享链接。源 PDF 不存入文件库。</p></div>
            <div className="space-y-2"><Label htmlFor="pdf-output">产物文件名</Label><Input id="pdf-output" name="outputName" required maxLength={120} placeholder="例如：数学讲义-第一章" aria-describedby="pdf-name-help" /><p id="pdf-name-help" className="text-xs text-muted-foreground">自动添加 .zip；包内合并文档使用同名 .md。</p></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label htmlFor="pdf-start">起始页（可选）</Label><Input id="pdf-start" name="start_page" type="number" min={1} max={100000} step={1} placeholder="1" value={draftOptions.start_page ?? ''} onChange={(event) => updateOption('start_page', event.target.value ? Number(event.target.value) : undefined)} /></div>
              <div className="space-y-2"><Label htmlFor="pdf-end">结束页（可选）</Label><Input id="pdf-end" name="end_page" type="number" min={1} max={100000} step={1} placeholder="末页" value={draftOptions.end_page ?? ''} onChange={(event) => updateOption('end_page', event.target.value ? Number(event.target.value) : undefined)} /></div>
            </div>
            <div className="space-y-2"><Label htmlFor="pdf-prompt">转换要求（可选）</Label><textarea id="pdf-prompt" name="prompt" maxLength={12000} rows={3} className="w-full resize-y rounded-md border border-input bg-transparent p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="留空使用默认提示词" /></div>
            <details className="border-y border-border py-3">
              <summary className="cursor-pointer py-1 text-sm font-medium focus-visible:outline-ring">高级参数（自动保存）</summary>
              <div className="mt-4 grid min-w-0 grid-cols-2 gap-4">
                <div className="col-span-2 space-y-2"><Label htmlFor="pdf-model">Gemini 模型</Label><Input id="pdf-model" name="model" required value={draftOptions.model} maxLength={107} onChange={(event) => updateOption('model', event.target.value)} /></div>
                {numberFields.map(([key, label, min, max]) => <div key={key} className="min-w-0 space-y-2"><Label htmlFor={`pdf-${key}`}>{label}</Label><Input id={`pdf-${key}`} name={key} type="number" required min={min} max={max} step={1} value={draftOptions[key]} onChange={(event) => updateOption(key, Number(event.target.value))} /></div>)}
                {choiceFields.map(([key, label, values]) => <div key={key} className="min-w-0 space-y-2"><Label htmlFor={`pdf-${key}`}>{label}</Label><Select id={`pdf-${key}`} name={key} value={draftOptions[key]} onChange={(event) => updateOption(key, event.target.value)} containerClassName="w-full">{values.map((value) => <option key={value} value={value}>{value}</option>)}</Select></div>)}
              </div>
              <Button type="button" variant="outline" className="mt-4 min-h-10" onClick={() => void saveAdvancedOptions()} disabled={configSaving || !config}><Save />{configSaving ? '保存中…' : '保存配置'}</Button>
            </details>
            <Button type="submit" className="min-h-11 w-full" disabled={submitting || configLoading || Boolean(configError)}>{submitting ? <LoaderCircle className="animate-spin" /> : <Play />}{submitting ? '提交中…' : '开始转换'}</Button>
          </fieldset>
        </form>
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
            <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer py-1 focus-visible:outline-ring">查看参数</summary><div className="mt-2 space-y-2 break-all"><p>{job.sourceUrl}</p>{job.prompt && <p>{job.prompt}</p>}<dl className="grid grid-cols-2 gap-2">{Object.entries(job.options || {}).map(([key, value]) => <div key={key}><dt>{key}</dt><dd className="text-foreground">{value}</dd></div>)}</dl>{job.finishedAt && <p>结束于 {dateLabel(job.finishedAt)}</p>}</div></details>
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
