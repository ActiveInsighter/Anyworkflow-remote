import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { ChevronRight, Play } from 'lucide-react'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { Composer, ComposerBar, ComposerBody } from '@/components/layout/composer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { PdfJobInput, PdfPageRange } from '@/lib/api/file-conversion'
import type { ConversionConfigState } from '../hooks/use-conversion-config'
import type { ConversionJobsState } from '../hooks/use-conversion-jobs'
import { usePdfUpload } from '@/features/files/hooks/use-pdf-upload'
import { getLibraryFile, type LibraryFile } from '@/lib/api/library-files'
import { toErrorMessage } from '@/lib/api/errors'
import { nameFromFile, nameFromUrl } from '../lib/source-name'
import { ConversionSourceField, type PdfSourceMode } from './conversion-source-field'

const MAX_TITLE_AS_NAME = 120
const EMPTY_DRAFT = { title: '', outputName: '', prompt: '' }

function readPage(value: string): number | undefined {
  return value ? Number(value) : undefined
}

/** One line naming the saved configuration a new job will run with. */
function configSummary(config: ConversionConfigState): string {
  if (config.loading) return '正在加载转换配置…'
  if (config.loadError || !config.config) return '转换配置未加载'
  const { options, revision } = config.config
  return `配置 v${revision} · ${options.model} · ${options.dpi} DPI`
}

/**
 * New PDF → Markdown job. A source is all it needs: the name comes from the file, and a job always
 * runs with the saved config, never the unsaved draft. An accepted job clears the composer.
 */
export function ConversionForm({ config, jobs }: { config: ConversionConfigState; jobs: ConversionJobsState }) {
  const submitLock = useRef(false)
  const [submitting, setSubmitting] = useState(false)
  const [params, setParams] = useSearchParams()
  const fileId = params.get('file') || ''
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [range, setRange] = useState<PdfPageRange>({})
  const [adjacentPages, setAdjacentPages] = useState(false)
  const [error, setError] = useState('')
  const [sourceMode, setSourceMode] = useState<PdfSourceMode>(fileId ? 'library' : 'link')
  const [selectedFile, setSelectedFile] = useState<LibraryFile | null>(null)
  const [sourceUrl, setSourceUrl] = useState('')
  const [dragging, setDragging] = useState(false)
  const upload = usePdfUpload()

  useEffect(() => {
    if (!fileId) return
    const controller = new AbortController()
    setSelectedFile(null)
    setSourceMode('library')
    void getLibraryFile(fileId, controller.signal).then(file => {
      if (!controller.signal.aborted) setSelectedFile(file)
    }).catch(cause => { if (!controller.signal.aborted) setError(toErrorMessage(cause)) })
    return () => controller.abort()
  }, [fileId])

  const ready = Boolean(config.config) && !config.loading && !config.saving && !config.loadError
  const busy = submitting || jobs.creating || config.loading
  const suggestedName =
    sourceMode === 'link' ? nameFromUrl(sourceUrl)
      : sourceMode === 'upload' ? nameFromFile(upload.uploaded?.fileName || upload.fileName)
        : nameFromFile(selectedFile?.fileName ?? '')
  const optionCount = [draft.outputName, draft.prompt, adjacentPages].filter(Boolean).length

  function setField(key: keyof typeof EMPTY_DRAFT, value: string) {
    setDraft(current => ({ ...current, [key]: value }))
  }

  function changeMode(mode: PdfSourceMode) {
    upload.cancel()
    setError('')
    jobs.clearCreateError()
    setSourceMode(mode)
  }

  function reset() {
    setDraft(EMPTY_DRAFT)
    setRange({})
    setAdjacentPages(false)
    setSourceUrl('')
    setSelectedFile(null)
    upload.clear()
    if (fileId) setParams({}, { replace: true })
  }

  function dropFile(event: DragEvent<HTMLFormElement>) {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (!file || busy) return
    changeMode('upload')
    void upload.upload(file)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitLock.current || jobs.creating || config.loading || upload.uploading) return
    submitLock.current = true
    setSubmitting(true)
    try {
      if (!config.config) {
        setError(config.loadError || '转换配置尚未加载，请刷新重试')
        return
      }
      const title = draft.title.trim() || suggestedName
      const outputName = draft.outputName.trim()
      if (!title) {
        setError('请填写任务名称')
        return
      }
      if (!outputName && title.length > MAX_TITLE_AS_NAME) {
        setError(`任务名称超过 ${MAX_TITLE_AS_NAME} 个字符，请填写较短的产物文件名`)
        return
      }
      if (range.start_page !== undefined && range.end_page !== undefined && range.end_page < range.start_page) {
        setError('结束页不能小于起始页')
        return
      }
      let selectedSourceUrl = sourceUrl.trim()
      if (sourceMode === 'upload') {
        const uploaded = upload.uploaded
        if (!uploaded || (uploaded.expiresAt && Date.parse(uploaded.expiresAt) <= Date.now())) {
          setError(uploaded ? '上传链接已过期，请重新选择文件' : '请先上传 PDF 文件')
          return
        }
        selectedSourceUrl = uploaded.sourceUrl
      }
      if (sourceMode === 'library' || (sourceMode === 'upload' && upload.uploaded?.id)) {
        const id = sourceMode === 'library' ? selectedFile?.id : upload.uploaded?.id
        if (!id) { setError('请先选择资料库文件'); return }
        try { selectedSourceUrl = (await getLibraryFile(id)).sourceUrl }
        catch (cause) { setError(toErrorMessage(cause)); return }
      }
      setError('')
      jobs.clearCreateError()
      const input: PdfJobInput = {
        title,
        sourceUrl: selectedSourceUrl,
        outputName,
        prompt: draft.prompt.trim(),
        configId: config.config.id,
        ...(range.start_page !== undefined ? { startPage: range.start_page } : {}),
        ...(range.end_page !== undefined ? { endPage: range.end_page } : {}),
        ...(adjacentPages ? { adjacentPages: true } : {}),
      }
      if (await jobs.create(input, config.config.revision)) reset()
    } finally {
      submitLock.current = false
      setSubmitting(false)
    }
  }

  return (
    <Composer
      aria-labelledby="conversion-form-title"
      dragging={dragging}
      onSubmit={submit}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={dropFile}
    >
      <h2 id="conversion-form-title" className="sr-only">新建转换</h2>
      <ComposerBody>
        <fieldset disabled={busy} className="flex min-w-0 flex-col gap-4">
          <ConversionSourceField
            mode={sourceMode}
            onModeChange={changeMode}
            sourceUrl={sourceUrl}
            onSourceUrlChange={setSourceUrl}
            upload={upload}
            selectedFile={selectedFile}
            onSelectFile={file => { setSelectedFile(file); setError('') }}
          />

          <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_15rem]">
            <Field>
              <FieldLabel htmlFor="pdf-title">任务名称</FieldLabel>
              <Input
                id="pdf-title"
                name="title"
                maxLength={200}
                placeholder={suggestedName || '例如：数学讲义'}
                value={draft.title}
                onChange={(event) => setField('title', event.target.value)}
              />
            </Field>
            <fieldset className="min-w-0">
              <legend className="mb-2 text-xs font-medium">页码范围（可选）</legend>
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                <Input
                  id="pdf-start"
                  name="start_page"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100000}
                  step={1}
                  placeholder="1"
                  aria-label="起始页（可选）"
                  value={range.start_page ?? ''}
                  onChange={(event) => setRange((current) => ({ ...current, start_page: readPage(event.target.value) }))}
                />
                <span className="text-xs text-muted-foreground" aria-hidden="true">至</span>
                <Input
                  id="pdf-end"
                  name="end_page"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100000}
                  step={1}
                  placeholder="末页"
                  aria-label="结束页（可选）"
                  value={range.end_page ?? ''}
                  onChange={(event) => setRange((current) => ({ ...current, end_page: readPage(event.target.value) }))}
                />
              </div>
            </fieldset>
          </div>

          <Collapsible className="group/options -mt-1">
            <CollapsibleTrigger className="-mx-1 flex min-h-touch items-center gap-1.5 rounded-md px-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/35 sm:min-h-7">
              <ChevronRight aria-hidden="true" className="size-3.5 transition-transform duration-fast group-data-[state=open]/options:rotate-90" />
              更多选项
              {optionCount ? <Badge variant="info" className="h-4.5 min-w-4.5 px-1 text-micro tabular-nums" aria-label={`已设置 ${optionCount} 项`}>{optionCount}</Badge> : null}
            </CollapsibleTrigger>
            {/* Stays mounted while folded: what was entered still applies to the job. */}
            <CollapsibleContent forceMount className="grid min-w-0 gap-4 pt-3 data-[state=closed]:hidden sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="pdf-output">产物文件名（可选）</FieldLabel>
                <Input
                  id="pdf-output"
                  name="outputName"
                  maxLength={MAX_TITLE_AS_NAME}
                  placeholder="默认同任务名称"
                  aria-describedby="pdf-output-help"
                  value={draft.outputName}
                  onChange={(event) => setField('outputName', event.target.value)}
                />
                <FieldDescription id="pdf-output-help">生成同名 .zip，包内为同名 .md</FieldDescription>
              </Field>
              <Field orientation="horizontal" className="items-start sm:pt-6">
                <FieldContent>
                  <FieldLabel htmlFor="pdf-adjacent">附带相邻页</FieldLabel>
                  <FieldDescription id="pdf-adjacent-help">
                    附带上一页底部和下一页顶部截图，辅助辨认本页边缘内容。
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id="pdf-adjacent"
                  className="mt-0.5"
                  checked={adjacentPages}
                  onCheckedChange={setAdjacentPages}
                  aria-describedby="pdf-adjacent-help"
                />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="pdf-prompt">转换要求（可选）</FieldLabel>
                <Textarea
                  id="pdf-prompt"
                  name="prompt"
                  maxLength={12000}
                  rows={2}
                  className="min-h-16 resize-y"
                  placeholder="仅本次生效，追加在系统提示词之后"
                  value={draft.prompt}
                  onChange={(event) => setField('prompt', event.target.value)}
                />
              </Field>
            </CollapsibleContent>
          </Collapsible>
        </fieldset>
        <ErrorAlert inline className="mt-3">
          {error || jobs.createError}
        </ErrorAlert>
      </ComposerBody>
      <ComposerBar>
        <p className="me-auto min-w-0 truncate text-caption text-muted-foreground" role="status">{configSummary(config)}</p>
        <Button type="submit" size="touch" className="w-full sm:w-auto" disabled={submitting || jobs.creating || !ready || (sourceMode === 'upload' && (upload.uploading || !upload.uploaded)) || (sourceMode === 'library' && !selectedFile)}>
          {jobs.creating ? <Spinner data-icon="inline-start" /> : <Play data-icon="inline-start" />}
          {jobs.creating ? '提交中…' : '开始转换'}
        </Button>
      </ComposerBar>
    </Composer>
  )
}
