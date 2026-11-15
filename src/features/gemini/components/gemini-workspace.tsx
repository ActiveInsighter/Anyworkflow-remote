import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { History, MessageSquarePlus, Sparkles, X } from 'lucide-react'
import { ConfirmDeleteDialog } from '@/components/feedback/confirm-dialog'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { ModelManagerButton } from '@/features/models/components/saved-model-select'
import { useAsyncData } from '@/hooks/use-async-data'
import { getGeminiConfig } from '@/lib/api/gemini'
import { cn } from '@/lib/utils'
import type { GeminiJob } from '@/types/gemini'
import { useGeminiJobs } from '../hooks/use-gemini-jobs'
import { GeminiComposer } from './gemini-composer'
import { GeminiConfigSheet } from './gemini-config-sheet'
import { GeminiHistory } from './gemini-history'
import { GeminiConversation } from './gemini-conversation'

export function GeminiWorkspace() {
  const jobs = useGeminiJobs()
  const config = useAsyncData(getGeminiConfig, [])
  const [deleting, setDeleting] = useState<GeminiJob | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const focusComposer = useRef(false)
  const [params, setParams] = useSearchParams()
  const opened = params.get('job')

  useEffect(() => {
    if (opened) { focusComposer.current = false; return }
    if (!focusComposer.current || historyOpen) return
    const frame = requestAnimationFrame(() => document.getElementById('gemini-prompt')?.focus())
    return () => cancelAnimationFrame(frame)
  }, [opened, historyOpen])

  function setOpened(id: string | null) {
    if (id) focusComposer.current = false
    setHistoryOpen(false)
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (id) next.set('job', id)
      else next.delete('job')
      return next
    })
  }
  function newMessage() {
    focusComposer.current = true
    setOpened(null)
    if (!opened && !historyOpen) document.getElementById('gemini-prompt')?.focus()
  }
  const historyProps = { jobs, opened, onOpen: setOpened, onNew: newMessage, onDelete: setDeleting }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-slot="gemini-workspace">
      <header className="flex min-h-header shrink-0 items-center justify-between gap-2 border-b px-3 py-2 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-touch" aria-label="打开消息记录" className="lg:hidden"><History /></Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-full max-w-sm gap-0 overscroll-contain" showCloseButton={false} aria-describedby={undefined}
              onCloseAutoFocus={(event) => {
                if (focusComposer.current && !opened) {
                  event.preventDefault()
                  document.getElementById('gemini-prompt')?.focus()
                }
              }}>
              <SheetHeader className="flex-row items-center justify-between border-b px-4 py-2">
                <SheetTitle>消息记录</SheetTitle>
                <SheetClose asChild><Button type="button" variant="ghost" size="icon-touch" aria-label="关闭消息记录"><X /></Button></SheetClose>
              </SheetHeader>
              <GeminiHistory {...historyProps} />
            </SheetContent>
          </Sheet>
          <Sparkles className="hidden size-4 shrink-0 text-primary sm:block" aria-hidden="true" />
          <h1 className="truncate text-body font-semibold">Gemini 消息</h1>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <ModelManagerButton showLabel />
          <GeminiConfigSheet config={config} />
        </div>
      </header>
      <div className="flex min-h-0 min-w-0 flex-1">
        <aside className="hidden w-68 shrink-0 flex-col border-e bg-subtle/60 lg:flex" aria-label="消息记录">
          <GeminiHistory {...historyProps} />
        </aside>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {opened ? <GeminiConversation key={opened} id={opened} onNew={newMessage} /> : null}
          {/* Keep the composer mounted so reading a previous reply preserves an unsent draft. */}
          <div className={cn('min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain', opened && 'hidden')}>
            <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center gap-7 px-4 pt-8 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:gap-9 sm:px-8 sm:py-12">
              <div className="flex flex-col items-start gap-3">
                <div className="mb-1 flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary"><Sparkles className="size-6" aria-hidden="true" /></div>
                <h2 className="text-title font-semibold tracking-heading sm:text-display">从一个问题开始</h2>
                <p className="text-body leading-relaxed text-muted-foreground">提问、整理资料，或让 Agent 完成一项任务。</p>
              </div>
              <div className="flex min-w-0 flex-col gap-3">
                <ErrorAlert>{config.error}</ErrorAlert>
                {config.error ? <Button variant="outline" onClick={() => void config.reload()}>重新加载消息配置</Button> : null}
                <GeminiComposer jobs={jobs} config={config.data?.config ?? null} />
              </div>
              <div className="flex items-start gap-2 text-caption leading-relaxed text-muted-foreground">
                <MessageSquarePlus className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <p>每次发送开启独立任务。添加 Markdown 后，可按分段批量生成回复。</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <ConfirmDeleteDialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open) setDeleting(null) }}
        title="删除消息" description={`删除「${deleting?.title ?? ''}」及其全部回复？`} busy={jobs.action.busy}
        onConfirm={() => {
          if (deleting) void jobs.remove(deleting).then((done) => {
            if (done) { if (opened === deleting.id) setOpened(null); setDeleting(null) }
          })
        }} />
    </div>
  )
}
