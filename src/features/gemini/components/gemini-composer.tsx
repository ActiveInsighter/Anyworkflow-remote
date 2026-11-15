import { ArrowUp, FileText, Scissors, X } from 'lucide-react'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { Composer, ComposerBody } from '@/components/layout/composer'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, ModalTitle, ModalTrigger } from '@/components/ui/modal'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { SavedModelSelect } from '@/features/models/components/saved-model-select'
import { formatFileSize } from '@/lib/format'
import type { GeminiConfig } from '@/types/gemini'
import { useGeminiComposer } from '../hooks/use-gemini-composer'
import type { useGeminiJobs } from '../hooks/use-gemini-jobs'
import { GeminiPreviewSheet } from './gemini-preview'
import { MarkdownPicker } from './markdown-picker'

const starters = [
  { label: '提炼要点', prompt: '请提炼以下内容的核心观点，按主题组织，保留关键细节。' },
  { label: '逐段整理', prompt: '请逐段整理以下资料，保留原有结构、公式和代码，不要合并不同段落。' },
  { label: '检查与改写', prompt: '请检查以下内容的逻辑与表达，指出问题并给出修改后的版本。' },
]

export function GeminiComposer({ jobs, config }: {
  jobs: ReturnType<typeof useGeminiJobs>; config: GeminiConfig | null
}) {
  const state = useGeminiComposer(jobs, config)
  return <div className="flex min-w-0 flex-col gap-4">
    <Composer className="border border-border-strong shadow-xs focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/15" aria-label="Gemini 消息" onSubmit={(event) => { event.preventDefault(); if (state.canSend) state.send() }}>
      <ComposerBody className="flex flex-col gap-4 p-4 sm:p-5">
        <Field>
          <FieldLabel htmlFor="gemini-prompt" className="sr-only">消息与提示词</FieldLabel>
          <Textarea id="gemini-prompt" name="prompt" autoComplete="off" value={state.prompt} disabled={state.busy} maxLength={12000} rows={4}
            aria-keyshortcuts="Control+Enter Meta+Enter"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) {
                event.preventDefault()
                if (state.canSend) state.send()
              }
            }}
            onChange={(event) => { state.setPrompt(event.target.value); state.clearErrors() }}
            className="max-h-80 min-h-32 resize-y border-0 bg-transparent p-0 text-base leading-relaxed shadow-none focus-visible:ring-0 sm:text-body"
            placeholder="写下问题，或描述你想完成的任务…" />
        </Field>
        {state.selected.length || state.text ? <ul className="flex min-w-0 flex-col gap-2" aria-label="已添加的内容">
          {state.selected.map((file) => <li key={file.id} className="flex min-w-0 items-center gap-3 rounded-lg bg-subtle px-3">
            <FileText className="size-4 shrink-0 text-primary" /><span className="min-w-0 flex-1 truncate text-body" title={file.fileName}>{file.fileName}</span>
            <span className="shrink-0 text-caption tabular-nums text-muted-foreground">{formatFileSize(file.size)}</span>
            <Button type="button" variant="ghost" size="icon-touch" disabled={state.busy} aria-label={`移除 ${file.fileName}`} onClick={() => state.toggle(file)}><X /></Button>
          </li>)}
          {state.text ? <li className="flex min-w-0 items-center gap-2 rounded-lg bg-subtle px-3">
            <FileText className="size-4 shrink-0 text-primary" /><span className="min-w-0 flex-1 truncate text-body">粘贴的 Markdown</span>
            <Button type="button" variant="ghost" size="touch" disabled={state.busy} onClick={() => state.setDetailsOpen(true)}>编辑</Button>
            <Button type="button" variant="ghost" size="icon-touch" disabled={state.busy} aria-label="移除粘贴正文" onClick={() => state.setText('')}><X /></Button>
          </li> : null}
        </ul> : null}
        <ErrorAlert>{state.fileError || state.action.error || jobs.creating.error}</ErrorAlert>
      </ComposerBody>
      <div className="flex flex-wrap items-center gap-1 px-2 pb-2 sm:px-3">
        <MarkdownPicker selected={state.selected} onToggle={state.toggle} disabled={state.busy} />
        <Modal open={state.detailsOpen} onOpenChange={state.setDetailsOpen}>
          <ModalTrigger render={<Button type="button" variant="ghost" size="touch" disabled={state.busy} />}><FileText />粘贴正文</ModalTrigger>
          <ModalContent size="md">
            <ModalHeader><ModalTitle>补充正文</ModalTitle></ModalHeader>
            <ModalBody>
              <FieldGroup>
                <Field><FieldLabel htmlFor="gemini-body">Markdown 正文</FieldLabel>
                  <Textarea id="gemini-body" name="markdown" autoComplete="off" rows={12} value={state.text} onChange={(event) => { state.setText(event.target.value); state.clearErrors() }} placeholder={`使用 ${config?.delimiter ?? '<!-- aw:split -->'} 独占一行分段`} />
                </Field>
                <Field><FieldLabel htmlFor="gemini-title">任务名称（可选）</FieldLabel>
                  <Input id="gemini-title" name="title" autoComplete="off" value={state.title} maxLength={200} onChange={(event) => state.setTitle(event.target.value)} placeholder="留空自动生成" />
                </Field>
              </FieldGroup>
            </ModalBody>
            <ModalFooter><Button type="button" onClick={() => state.setDetailsOpen(false)}>完成</Button></ModalFooter>
          </ModalContent>
        </Modal>
        {state.text || state.selected.length ? <Button type="button" variant="ghost" size="touch" aria-label="预览分段" onClick={state.inspect} disabled={!state.canSend}>
          {state.action.pending === 'preview' ? <Spinner /> : <Scissors />}<span>预览分段</span>
        </Button> : null}
      </div>
      <div className="flex min-w-0 items-end justify-between gap-3 border-t bg-subtle/40 px-3 py-3 sm:px-4">
        <div className="min-w-0 flex-1 sm:max-w-72"><SavedModelSelect id="gemini-model" manage={false} value={state.model || config?.model || 'gemini-3.5-flash-lite'} onChange={state.setModel} disabled={state.busy || !config} /></div>
        <Button type="submit" size="icon-touch" aria-label={state.action.pending === 'send' ? '发送中…' : '发送'} title="发送（Ctrl / ⌘ + Enter）" disabled={!state.canSend} className="rounded-full sm:size-9">
          {state.action.pending === 'send' ? <Spinner /> : <ArrowUp />}
        </Button>
      </div>
    </Composer>
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-1" aria-label="快捷提示词">
        {starters.map((starter) => <Button key={starter.label} type="button" variant="ghost" size="touch" disabled={state.busy} onClick={() => {
          state.setPrompt(starter.prompt); state.clearErrors(); document.getElementById('gemini-prompt')?.focus()
        }}>{starter.label}</Button>)}
      </div>
      <span className="hidden text-caption text-muted-foreground xl:inline">Ctrl / ⌘ + Enter 发送</span>
    </div>
    <GeminiPreviewSheet preview={state.preview} prompt={state.prompt} onClose={() => state.setPreview(null)} />
  </div>
}
