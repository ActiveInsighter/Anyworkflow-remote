import { FileText, MessageSquareText, Scissors, Send, X } from 'lucide-react'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { Composer, ComposerBar, ComposerBody } from '@/components/layout/composer'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
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

export function GeminiComposer({ jobs, config }: {
  jobs: ReturnType<typeof useGeminiJobs>; config: GeminiConfig | null
}) {
  const state = useGeminiComposer(jobs, config)
  return <>
    <Composer className="focus-within:ring-2 focus-within:ring-ring/25" aria-label="Gemini 消息" onSubmit={(event) => { event.preventDefault(); state.send() }}>
      <ComposerBody className="space-y-3 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-caption font-medium text-muted-foreground"><MessageSquareText className="size-4" />新消息</div>
        <Field>
          <FieldLabel htmlFor="gemini-prompt" className="sr-only">消息与提示词</FieldLabel>
          <Textarea id="gemini-prompt" value={state.prompt} disabled={state.busy} maxLength={12000} rows={4}
            onChange={(event) => { state.setPrompt(event.target.value); state.clearErrors() }}
            className="min-h-32 resize-y border-0 bg-transparent p-0 text-body shadow-none focus-visible:ring-0"
            placeholder="想让 Gemini 帮你做什么？" />
        </Field>
        {state.selected.length || state.text ? <ul className="flex min-w-0 flex-col gap-2" aria-label="已添加的内容">
          {state.selected.map((file) => <li key={file.id} className="flex min-w-0 items-center gap-2 rounded-lg border px-3">
            <FileText className="size-4 shrink-0 text-primary" /><span className="min-w-0 flex-1 truncate text-body">{file.fileName}</span>
            <span className="text-caption text-muted-foreground">{formatFileSize(file.size)}</span>
            <Button type="button" variant="ghost" size="icon-touch" disabled={state.busy} aria-label={`移除 ${file.fileName}`} onClick={() => state.toggle(file)}><X /></Button>
          </li>)}
          {state.text ? <li className="flex min-w-0 items-center gap-2 rounded-lg border px-3">
            <FileText className="size-4 shrink-0 text-primary" /><span className="min-w-0 flex-1 truncate text-body">粘贴的 Markdown</span>
            <Button type="button" variant="ghost" size="sm" disabled={state.busy} onClick={() => state.setDetailsOpen(true)}>编辑</Button>
            <Button type="button" variant="ghost" size="icon-touch" disabled={state.busy} aria-label="移除粘贴正文" onClick={() => state.setText('')}><X /></Button>
          </li> : null}
        </ul> : null}
        <div className="flex flex-wrap items-center gap-1">
          <MarkdownPicker selected={state.selected} onToggle={state.toggle} disabled={state.busy} />
          <Modal open={state.detailsOpen} onOpenChange={state.setDetailsOpen}>
            <ModalTrigger render={<Button type="button" variant="ghost" size="touch" disabled={state.busy} />}><FileText />粘贴正文</ModalTrigger>
            <ModalContent size="md">
              <ModalHeader><ModalTitle>补充正文</ModalTitle></ModalHeader>
              <ModalBody className="space-y-5">
                <Field><FieldLabel htmlFor="gemini-body">Markdown 正文</FieldLabel>
                  <Textarea id="gemini-body" rows={12} value={state.text} onChange={(event) => { state.setText(event.target.value); state.clearErrors() }} placeholder={`使用 ${config?.delimiter ?? '<!-- aw:split -->'} 独占一行分段`} />
                </Field>
                <Field><FieldLabel htmlFor="gemini-title">任务名称（可选）</FieldLabel>
                  <Input id="gemini-title" value={state.title} maxLength={200} onChange={(event) => state.setTitle(event.target.value)} placeholder="留空自动生成" />
                </Field>
              </ModalBody>
              <ModalFooter><Button type="button" onClick={() => state.setDetailsOpen(false)}>完成</Button></ModalFooter>
            </ModalContent>
          </Modal>
          {state.text || state.selected.length ? <Button type="button" variant="ghost" size="touch" aria-label="预览分段" onClick={state.inspect} disabled={!state.canSend}>
            {state.action.pending === 'preview' ? <Spinner /> : <Scissors />}<span className="hidden sm:inline">预览分段</span>
          </Button> : null}
        </div>
        <ErrorAlert>{state.fileError || state.action.error || jobs.creating.error}</ErrorAlert>
      </ComposerBody>
      <ComposerBar className="justify-between gap-3">
        <div className="min-w-0 flex-1 sm:max-w-80"><SavedModelSelect id="gemini-model" manage={false} value={state.model || config?.model || 'gemini-3.5-flash-lite'} onChange={state.setModel} disabled={state.busy || !config} /></div>
        <Button type="submit" size="touch" disabled={!state.canSend}>{state.action.pending === 'send' ? <Spinner /> : <Send />}{state.action.pending === 'send' ? '发送中…' : '发送'}</Button>
      </ComposerBar>
    </Composer>
    <GeminiPreviewSheet preview={state.preview} prompt={state.prompt} onClose={() => state.setPreview(null)} />
  </>
}
