import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ChevronDown, Scissors, Send, X } from 'lucide-react'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { Composer, ComposerBar, ComposerBody } from '@/components/layout/composer'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { useAsyncAction } from '@/hooks/use-async-action'
import { previewGemini } from '@/lib/api/gemini'
import { toErrorMessage } from '@/lib/api/errors'
import { getLibraryFile, readLibraryMarkdown, type LibraryFile } from '@/lib/api/library-files'
import { formatFileSize } from '@/lib/format'
import type { GeminiInput, GeminiPreview } from '@/types/gemini'
import type { useGeminiJobs } from '../hooks/use-gemini-jobs'
import { MarkdownPicker } from './markdown-picker'

const INITIAL = { title: '', prompt: '', systemPrompt: '', text: '', delimiter: '<!-- aw:split -->', model: 'gemini-3.5-flash-lite', concurrency: 5, thinkingLevel: '', maxOutputTokens: 8192 }

export function GeminiComposer({ jobs }: { jobs: ReturnType<typeof useGeminiJobs> }) {
  const [fields, setFields] = useState(INITIAL)
  const [selected, setSelected] = useState<LibraryFile[]>([])
  const [preview, setPreview] = useState<GeminiPreview | null>(null)
  const [fileError, setFileError] = useState('')
  const action = useAsyncAction()
  const busy = action.busy || jobs.creating.busy
  const controller = useRef<AbortController | null>(null)
  const [params, setParams] = useSearchParams()
  const initialFile = params.get('file') || ''
  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => {
    if (!initialFile) return
    const abort = new AbortController()
    void getLibraryFile(initialFile, abort.signal).then(file => {
      if (abort.signal.aborted) return
      if (!file.id.endsWith('.md')) throw new Error('此页面只支持 .md 文件')
      setSelected(current => current.some(item => item.id === file.id) ? current : [...current, file])
      setPreview(null)
    }).catch(error => { if (!abort.signal.aborted) setFileError(toErrorMessage(error)) })
    return () => abort.abort()
  }, [initialFile])

  function change<K extends keyof typeof INITIAL>(key: K, value: (typeof INITIAL)[K]) {
    setFields(current => ({ ...current, [key]: value })); setPreview(null); action.clearError(); jobs.creating.clearError()
  }
  function toggle(file: LibraryFile) {
    setFileError(''); setPreview(null)
    setSelected(current => current.some(item => item.id === file.id) ? current.filter(item => item.id !== file.id) : [...current, file])
  }
  async function input(): Promise<GeminiInput> {
    if (selected.reduce((sum, file) => sum + file.size, 0) + new TextEncoder().encode(fields.text + fields.prompt + fields.systemPrompt).byteLength > 2 * 1024 * 1024) throw new Error('文件、正文和提示词合计不能超过 2 MiB')
    controller.current?.abort()
    const next = new AbortController()
    controller.current = next
    // Bounded in groups to avoid a burst when twenty small files are selected.
    const sources: GeminiInput['sources'] = []
    for (let offset = 0; offset < selected.length; offset += 4) {
      sources.push(...await Promise.all(selected.slice(offset, offset + 4).map(async file => ({
        id: file.id, name: file.fileName, content: await readLibraryMarkdown(file.id, next.signal),
      }))))
    }
    return { ...fields, sources }
  }
  function inspect() {
    void action.run('preview', async () => { const value = await input(); setPreview(await previewGemini(value, controller.current?.signal)) }, { failure: false })
  }
  function send() {
    void action.run('send', async () => {
      const value = await input()
      if (await jobs.create(value)) {
        setFields(current => ({ ...current, title: '', prompt: '', text: '' })); setSelected([]); setPreview(null)
        setParams(current => { const next = new URLSearchParams(current); next.delete('file'); return next }, { replace: true })
      }
    }, { failure: false })
  }
  return <Composer onSubmit={event => { event.preventDefault(); send() }} aria-label="Gemini 消息">
    <ComposerBody>
      <fieldset disabled={busy} className="min-w-0">
        <FieldGroup>
          <Field><FieldLabel htmlFor="gemini-prompt">消息与提示词</FieldLabel><Textarea id="gemini-prompt" value={fields.prompt} onChange={event => change('prompt', event.target.value)} maxLength={12000} rows={5} placeholder="直接提问，或填写对每个分段执行的要求…" /></Field>
          {selected.length ? <ul className="flex min-w-0 flex-col gap-1" aria-label="已选 Markdown 文件">{selected.map(file => <li key={file.id} className="flex min-w-0 items-center gap-2 text-body"><span className="min-w-0 flex-1 truncate">{file.fileName}</span><span className="shrink-0 text-caption text-muted-foreground">{formatFileSize(file.size)}</span><Button type="button" variant="ghost" size="icon-touch" aria-label={`移除 ${file.fileName}`} onClick={() => toggle(file)}><X /></Button></li>)}</ul> : null}
          <div><MarkdownPicker selected={selected} onToggle={toggle} disabled={busy} /></div>
          <FieldGroup className="sm:grid sm:grid-cols-[minmax(0,1fr)_7rem]">
            <Field><FieldLabel htmlFor="gemini-delimiter">分隔符（独占一行）</FieldLabel><Input id="gemini-delimiter" value={fields.delimiter} onChange={event => change('delimiter', event.target.value)} maxLength={120} required /><FieldDescription>每个非空分段独立发送，附带相同提示词。代码块内不分割。</FieldDescription></Field>
            <Field><FieldLabel htmlFor="gemini-concurrency">并发数</FieldLabel><Input id="gemini-concurrency" type="number" min={1} max={16} value={fields.concurrency} onChange={event => change('concurrency', event.target.valueAsNumber)} required /></Field>
          </FieldGroup>
          <Collapsible>
            <CollapsibleTrigger asChild><Button type="button" variant="ghost" size="sm"><ChevronDown data-icon="inline-start" />正文与模型设置</Button></CollapsibleTrigger>
            <CollapsibleContent forceMount className="hidden data-[state=open]:block">
              <FieldGroup className="pt-4">
                <Field><FieldLabel htmlFor="gemini-body">补充正文</FieldLabel><Textarea id="gemini-body" rows={5} value={fields.text} onChange={event => change('text', event.target.value)} placeholder="也可以粘贴 Markdown，使用同一分隔符分段。" /></Field>
                <Field><FieldLabel htmlFor="gemini-system">系统提示词</FieldLabel><Textarea id="gemini-system" rows={3} maxLength={12000} value={fields.systemPrompt} onChange={event => change('systemPrompt', event.target.value)} /></Field>
                <Field><FieldLabel htmlFor="gemini-title">任务名称</FieldLabel><Input id="gemini-title" maxLength={200} value={fields.title} onChange={event => change('title', event.target.value)} placeholder="留空自动生成" /></Field>
                <Field><FieldLabel htmlFor="gemini-model">Gemini 模型 ID</FieldLabel><Input id="gemini-model" value={fields.model} onChange={event => change('model', event.target.value)} required pattern="gemini-[a-zA-Z0-9._-]+" /></Field>
                <FieldGroup className="sm:grid sm:grid-cols-2">
                  <Field><FieldLabel htmlFor="gemini-thinking">思考程度</FieldLabel><NativeSelect id="gemini-thinking" value={fields.thinkingLevel} onChange={event => change('thinkingLevel', event.target.value)}><option value="">模型默认</option><option value="minimal">Minimal</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></NativeSelect></Field>
                  <Field><FieldLabel htmlFor="gemini-output">最大输出 Token</FieldLabel><Input id="gemini-output" type="number" min={256} max={65536} value={fields.maxOutputTokens} onChange={event => change('maxOutputTokens', event.target.valueAsNumber)} required /></Field>
                </FieldGroup>
              </FieldGroup>
            </CollapsibleContent>
          </Collapsible>
        </FieldGroup>
      </fieldset>
      <ErrorAlert className="mt-3">{fileError || action.error || jobs.creating.error}</ErrorAlert>
      {preview ? <section className="mt-4 flex min-w-0 flex-col gap-3" aria-label="分段预览"><p role="status" className="text-body font-medium">将发送 {preview.totalChunks} 段</p><ol className="flex max-h-64 flex-col gap-3 overflow-y-auto">{preview.chunks.map(chunk => <li key={chunk.index} className="min-w-0 text-caption"><p className="break-all font-medium">{chunk.index}. {chunk.sourceName} · 第 {chunk.part} 段 · {formatFileSize(chunk.bytes)}</p><pre className="mt-1 whitespace-pre-wrap break-words font-sans text-muted-foreground">{chunk.excerpt || '仅发送提示词'}</pre></li>)}</ol></section> : null}
    </ComposerBody>
    <ComposerBar>
      <Button type="button" variant="ghost" onClick={inspect} disabled={busy}>{action.pending === 'preview' ? <Spinner data-icon="inline-start" /> : <Scissors data-icon="inline-start" />}预览分段</Button>
      <Button type="submit" disabled={busy}>{action.pending === 'send' ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" />}{busy && action.pending === 'send' ? '提交中…' : '发送消息'}</Button>
    </ComposerBar>
  </Composer>
}
