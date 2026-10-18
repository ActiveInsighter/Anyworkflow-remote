import { useState, type FormEvent } from 'react'
import { Play } from 'lucide-react'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import type { PdfJobInput, PdfPageRange } from '@/lib/api/file-conversion'
import type { ConversionConfigState } from '../hooks/use-conversion-config'
import type { ConversionJobsState } from '../hooks/use-conversion-jobs'

const MAX_TITLE_AS_NAME = 120

function readPage(value: string): number | undefined {
  return value ? Number(value) : undefined
}

/** New PDF → Markdown job. It always runs with the saved config, never the unsaved draft. */
export function ConversionForm({ config, jobs }: { config: ConversionConfigState; jobs: ConversionJobsState }) {
  const [range, setRange] = useState<PdfPageRange>({})
  const [error, setError] = useState('')

  const ready = Boolean(config.config) && !config.loading && !config.saving && !config.loadError

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (jobs.creating || config.loading) return
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
    setError('')
    jobs.clearCreateError()
    const input: PdfJobInput = {
      title: text('title'),
      sourceUrl: text('sourceUrl'),
      outputName: text('outputName'),
      prompt: text('prompt'),
      configId: config.config.id,
      ...(range.start_page !== undefined ? { startPage: range.start_page } : {}),
      ...(range.end_page !== undefined ? { endPage: range.end_page } : {}),
    }
    await jobs.create(input, config.config.revision)
  }

  return (
    <Card aria-labelledby="conversion-form-title">
      <CardHeader>
        <CardTitle id="conversion-form-title">新建转换</CardTitle>
        <CardDescription>PDF → Markdown，产物打包为 ZIP。</CardDescription>
      </CardHeader>
      <form onSubmit={submit}>
        <CardContent>
          <fieldset disabled={jobs.creating || config.loading} className="min-w-0">
            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel htmlFor="pdf-title">任务名称</FieldLabel>
                <Input id="pdf-title" name="title" required maxLength={200} placeholder="例如：数学讲义" />
              </Field>
              <Field>
                <FieldLabel htmlFor="pdf-source">PDF 源文件地址</FieldLabel>
                <Input
                  id="pdf-source"
                  name="sourceUrl"
                  type="url"
                  required
                  maxLength={4096}
                  placeholder="https://…"
                  aria-describedby="pdf-source-help"
                />
                <FieldDescription id="pdf-source-help">
                  支持公开 PDF 直链或 Google Drive 分享链接，源文件不会存入文件库。
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="pdf-output">产物文件名（可选）</FieldLabel>
                <Input
                  id="pdf-output"
                  name="outputName"
                  maxLength={MAX_TITLE_AS_NAME}
                  placeholder="留空时使用任务名称"
                  aria-describedby="pdf-output-help"
                />
                <FieldDescription id="pdf-output-help">自动添加 .zip，包内文档使用同名 .md。</FieldDescription>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="pdf-start">起始页（可选）</FieldLabel>
                  <Input
                    id="pdf-start"
                    name="start_page"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100000}
                    step={1}
                    placeholder="1"
                    value={range.start_page ?? ''}
                    onChange={(event) => setRange((current) => ({ ...current, start_page: readPage(event.target.value) }))}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="pdf-end">结束页（可选）</FieldLabel>
                  <Input
                    id="pdf-end"
                    name="end_page"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100000}
                    step={1}
                    placeholder="末页"
                    value={range.end_page ?? ''}
                    onChange={(event) => setRange((current) => ({ ...current, end_page: readPage(event.target.value) }))}
                  />
                </Field>
              </div>
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
          <Button type="submit" size="touch" className="w-full" disabled={jobs.creating || !ready}>
            {jobs.creating ? <Spinner data-icon="inline-start" /> : <Play data-icon="inline-start" />}
            {jobs.creating ? '提交中…' : '开始转换'}
          </Button>
          <p className="text-xs text-muted-foreground">任务使用已保存的配置；修改高级参数后请先保存。</p>
        </CardFooter>
      </form>
    </Card>
  )
}
