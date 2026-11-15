import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useAsyncAction } from '@/hooks/use-async-action'
import { previewGemini } from '@/lib/api/gemini'
import { toErrorMessage } from '@/lib/api/errors'
import { getLibraryFile, readLibraryMarkdown, type LibraryFile } from '@/lib/api/library-files'
import type { GeminiConfig, GeminiInput, GeminiPreview } from '@/types/gemini'
import type { useGeminiJobs } from './use-gemini-jobs'

export function useGeminiComposer(jobs: ReturnType<typeof useGeminiJobs>, config: GeminiConfig | null) {
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
        const created = await jobs.create(await input())
        if (created) {
          setTitle('')
          setPrompt('')
          setText('')
          setSelected([])
          setPreview(null)
          setParams(
            (current) => {
              const next = new URLSearchParams(current)
              next.delete('file')
              next.set('job', created.id)
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
  return { prompt, setPrompt, text, setText, title, setTitle, model, setModel, detailsOpen, setDetailsOpen,
    selected, preview, setPreview, busy, action, fileError, clearErrors, toggle, inspect, send, canSend }
}
