import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { FileText, Scissors, Send, X } from 'lucide-react'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { Composer, ComposerBar, ComposerBody } from '@/components/layout/composer'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTrigger,
} from '@/components/ui/modal'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { SavedModelSelect } from '@/features/models/components/saved-model-select'
import { useAsyncAction } from '@/hooks/use-async-action'
import { previewGemini } from '@/lib/api/gemini'
import { toErrorMessage } from '@/lib/api/errors'
import { getLibraryFile, readLibraryMarkdown, type LibraryFile } from '@/lib/api/library-files'
import { formatFileSize } from '@/lib/format'
import type { GeminiConfig, GeminiInput, GeminiPreview } from '@/types/gemini'
import type { useGeminiJobs } from '../hooks/use-gemini-jobs'
import { GeminiPreviewSheet } from './gemini-preview'
import { MarkdownPicker } from './markdown-picker'

export function GeminiComposer({
  jobs,
  config,
}: {
  jobs: ReturnType<typeof useGeminiJobs>
  config: GeminiConfig | null
}) {
  const [prompt, setPrompt] = useState('')
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [model, setModel] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(false)
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
    void getLibraryFile(initialFile, abort.signal)
      .then((file) => {
        if (abort.signal.aborted) return
        if (!file.id.endsWith('.md')) throw new Error('此页面只支持 .md 文件')
        setSelected((current) => (current.some((item) => item.id === file.id) ? current : [...current, file]))
      })
      .catch((error) => {
        if (!abort.signal.aborted) setFileError(toErrorMessage(error))
      })
    return () => abort.abort()
  }, [initialFile])
  function clearErrors() {
    action.clearError()
    jobs.creating.clearError()
    setFileError('')
  }
  function toggle(file: LibraryFile) {
    clearErrors()
    setSelected((current) =>
      current.some((item) => item.id === file.id)
        ? current.filter((item) => item.id !== file.id)
        : [...current, file],
    )
  }
  async function input(): Promise<GeminiInput> {
    if (!config) throw new Error('请等待消息配置加载完成')
    if (
      selected.reduce((sum, file) => sum + file.size, 0) +
        new TextEncoder().encode(text + prompt + config.systemPrompt).byteLength >
      2 * 1024 * 1024
    )
      throw new Error('文件、正文和提示词合计不能超过 2 MiB')
    controller.current?.abort()
    const next = new AbortController()
    controller.current = next
    const sources: GeminiInput['sources'] = []
    for (let offset = 0; offset < selected.length; offset += 4)
      sources.push(
        ...(await Promise.all(
          selected
            .slice(offset, offset + 4)
            .map(async (file) => ({
              id: file.id,
              name: file.fileName,
              content: await readLibraryMarkdown(file.id, next.signal),
            })),
        )),
      )
    return { ...config, title, prompt, text, model: model || config.model, sources }
  }
  function inspect() {
    void action.run(
      'preview',
      async () => setPreview(await previewGemini(await input(), controller.current?.signal)),
      { failure: false },
    )
  }
  function send() {
    void action.run(
      'send',
      async () => {
        if (await jobs.create(await input())) {
          setTitle('')
          setPrompt('')
          setText('')
          setSelected([])
          setPreview(null)
          setParams(
            (current) => {
              const next = new URLSearchParams(current)
              next.delete('file')
              return next
            },
            { replace: true },
          )
        }
      },
      { failure: false },
    )
  }
  const canSend = Boolean(prompt.trim() || text.trim() || selected.length) && Boolean(config) && !busy
  return (
    <>
      <Composer
        onSubmit={(event) => {
          event.preventDefault()
          send()
        }}
        aria-label="Gemini 消息"
      >
        <ComposerBody className="pb-2 sm:pb-2">
          <Field>
            <FieldLabel htmlFor="gemini-prompt" className="sr-only">
              消息与提示词
            </FieldLabel>
            <Textarea
              id="gemini-prompt"
              value={prompt}
              onChange={(event) => {
                setPrompt(event.target.value)
                clearErrors()
              }}
              disabled={busy}
              maxLength={12000}
              rows={6}
              className="min-h-40 resize-y border-0 bg-transparent px-1 py-2 shadow-none focus-visible:ring-2"
              placeholder="发送消息，或填写对文件的处理要求…"
            />
          </Field>
          {selected.length || text ? (
            <ul className="mt-3 flex min-w-0 flex-col gap-1" aria-label="已添加的内容">
              {selected.map((file) => (
                <li
                  key={file.id}
                  className="flex min-w-0 items-center gap-2 rounded-lg bg-secondary/60 px-3 text-body"
                >
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{file.fileName}</span>
                  <span className="shrink-0 text-caption text-muted-foreground">
                    {formatFileSize(file.size)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-touch"
                    disabled={busy}
                    aria-label={`移除 ${file.fileName}`}
                    onClick={() => toggle(file)}
                  >
                    <X />
                  </Button>
                </li>
              ))}
              {text ? (
                <li className="flex min-w-0 items-center gap-2 rounded-lg bg-secondary/60 px-3 text-body">
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">粘贴的 Markdown</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => setDetailsOpen(true)}
                  >
                    编辑
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-touch"
                    disabled={busy}
                    aria-label="移除粘贴正文"
                    onClick={() => setText('')}
                  >
                    <X />
                  </Button>
                </li>
              ) : null}
            </ul>
          ) : null}
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1">
            <MarkdownPicker selected={selected} onToggle={toggle} disabled={busy} />
            <Modal open={detailsOpen} onOpenChange={setDetailsOpen}>
              <ModalTrigger render={<Button type="button" variant="ghost" size="touch" disabled={busy} />}>
                <FileText data-icon="inline-start" />
                粘贴正文
              </ModalTrigger>
              <ModalContent size="md">
                <ModalHeader>
                  <ModalTitle>补充正文</ModalTitle>
                </ModalHeader>
                <ModalBody className="space-y-5">
                  <Field>
                    <FieldLabel htmlFor="gemini-body">Markdown 正文</FieldLabel>
                    <Textarea
                      id="gemini-body"
                      rows={12}
                      value={text}
                      onChange={(event) => {
                        setText(event.target.value)
                        clearErrors()
                      }}
                      placeholder={`使用 ${config?.delimiter ?? '<!-- aw:split -->'} 独占一行分段`}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="gemini-title">任务名称（可选）</FieldLabel>
                    <Input
                      id="gemini-title"
                      value={title}
                      maxLength={200}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="留空自动生成"
                    />
                  </Field>
                </ModalBody>
                <ModalFooter>
                  <Button type="button" onClick={() => setDetailsOpen(false)}>
                    完成
                  </Button>
                </ModalFooter>
              </ModalContent>
            </Modal>
            {text || selected.length ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-touch"
                aria-label="预览分段"
                onClick={inspect}
                disabled={!canSend}
              >
                {action.pending === 'preview' ? <Spinner /> : <Scissors />}
              </Button>
            ) : null}
          </div>
          <ErrorAlert className="mt-2">{fileError || action.error || jobs.creating.error}</ErrorAlert>
        </ComposerBody>
        <ComposerBar className="justify-between gap-2">
          <div className="min-w-0 flex-1 basis-40 sm:max-w-80">
            <SavedModelSelect
              id="gemini-model"
              manage={false}
              value={model || config?.model || 'gemini-3.5-flash-lite'}
              onChange={setModel}
              disabled={busy || !config}
            />
          </div>
          <Button type="submit" size="touch" disabled={!canSend}>
            {action.pending === 'send' ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Send data-icon="inline-start" />
            )}
            {action.pending === 'send' ? '提交中…' : '发送'}
          </Button>
        </ComposerBar>
      </Composer>
      <GeminiPreviewSheet preview={preview} prompt={prompt} onClose={() => setPreview(null)} />
    </>
  )
}
