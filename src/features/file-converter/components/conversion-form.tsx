import { useState, type FormEvent } from 'react'
import { Play } from 'lucide-react'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { PdfJobInput, PdfPageRange } from '@/lib/api/file-conversion'
import type { ConversionConfigState } from '../hooks/use-conversion-config'
import type { ConversionJobsState } from '../hooks/use-conversion-jobs'
import { usePdfUpload } from '../hooks/use-pdf-upload'
import { ConversionSourceField, type PdfSourceMode } from './conversion-source-field'

const MAX_TITLE_AS_NAME = 120

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

/** New PDF → Markdown job. It always runs with the saved config, never the unsaved draft. */
export function ConversionForm({ config, jobs }: { config: ConversionConfigState; jobs: ConversionJobsState }) {
  const [range, setRange] = useState<PdfPageRange>({})
  const [adjacentPages, setAdjacentPages] = useState(false)
  const [error, setError] = useState('')
  const [sourceMode, setSourceMode] = useState<PdfSourceMode>('link')
  const [sourceUrl, setSourceUrl] = useState('')
  const upload = usePdfUpload()

  const ready = Boolean(config.config) && !config.loading && !config.saving && !config.loadError

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (jobs.creating || config.loading || upload.uploading) return
    if (!config.config) {
      setError(config.loadError || '转换配置尚未加载，请刷新重试')
      return
    }
    const form = new FormData(event.currentTarget)
    const text = (key: string) => String(form.get(key) || '').trim()
    if (!text('outputName') && text('title').length > MAX_TITLE_AS_NAME) {
      setError(`任务名称超过 ${MAX_TITLE_AS_NAME} 个字符，请填写较短的产物文件名`)
      return
    }
    if (range.start_page !== undefined && range.end_page !== undefined && range.end_page < range.start_page) {
      setError('结束页不能小于起始页')
      return
    }
    let selectedSourceUrl = text('sourceUrl')
    if (sourceMode === 'upload') {
      const uploaded = upload.uploaded
      if (!uploaded || Date.parse(uploaded.expiresAt) <= Date.now()) {
        setError(uploaded ? '上传链接已过期，请重新选择文件' : '请先上传 PDF 文件')
        return
      }
      selectedSourceUrl = uploaded.sourceUrl
    }
    setError('')
    jobs.clearCreateError()
    const input: PdfJobInput = {
      title: text('title'),
      sourceUrl: selectedSourceUrl,
      outputName: text('outputName'),
      prompt: text('prompt'),
      configId: config.config.id,
      ...(range.start_page !== undefined ? { startPage: range.start_page } : {}),
      ...(range.end_page !== undefined ? { endPage: range.end_page } : {}),
      ...(adjacentPages ? { adjacentPages: true } : {}),
    }
    await jobs.create(input, config.config.revision)
  }

  return (
    <Card aria-labelledby="conversion-form-title">
      <CardHeader>
        <CardTitle id="conversion-form-title">新建转换</CardTitle>
      </CardHeader>
      <form onSubmit={submit}>
        <CardContent>
          <fieldset disabled={jobs.creating || config.loading} className="min-w-0">
            <FieldGroup className="gap-5">
              <ConversionSourceField
                mode={sourceMode}
                onModeChange={(mode) => {
                  upload.cancel()
                  setError('')
                  jobs.clearCreateError()
                  setSourceMode(mode)
                }}
                sourceUrl={sourceUrl}
                onSourceUrlChange={setSourceUrl}
                upload={upload}
              />

              <FieldSeparator />

              <Field>
                <FieldLabel htmlFor="pdf-title">任务名称</FieldLabel>
                <Input id="pdf-title" name="title" required maxLength={200} placeholder="例如：数学讲义" />
              </Field>
              <Field>
                <FieldLabel htmlFor="pdf-output">产物文件名（可选）</FieldLabel>
                <Input
                  id="pdf-output"
                  name="outputName"
                  maxLength={MAX_TITLE_AS_NAME}
                  placeholder="默认同任务名称"
                  aria-describedby="pdf-output-help"
                />
                <FieldDescription id="pdf-output-help">生成同名 .zip，包内为同名 .md</FieldDescription>
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

              <FieldSeparator />

              <Field orientation="horizontal" className="items-start">
                <FieldContent>
                  <FieldLabel htmlFor="pdf-adjacent">附带相邻页</FieldLabel>
                  <FieldDescription id="pdf-adjacent-help">
                    同时发送上一页底部和下一页顶部，补全跨页截断的句子、公式和表格行。
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
              <Field>
                <FieldLabel htmlFor="pdf-prompt">转换要求（可选）</FieldLabel>
                <Textarea
                  id="pdf-prompt"
                  name="prompt"
                  maxLength={12000}
                  rows={3}
                  className="min-h-20 resize-y"
                  placeholder="仅本次生效，追加在系统提示词之后"
                />
              </Field>
            </FieldGroup>
          </fieldset>
          <ErrorAlert inline className="mt-4">
            {error || jobs.createError}
          </ErrorAlert>
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-2">
          <Button type="submit" size="touch" className="w-full" disabled={jobs.creating || !ready || (sourceMode === 'upload' && (upload.uploading || !upload.uploaded))}>
            {jobs.creating ? <Spinner data-icon="inline-start" /> : <Play data-icon="inline-start" />}
            {jobs.creating ? '提交中…' : '开始转换'}
          </Button>
          <p className="truncate text-center text-xs text-muted-foreground" role="status">{configSummary(config)}</p>
        </CardFooter>
      </form>
    </Card>
  )
}
