import { isAntigravity } from '@/lib/domain/gemini-agent'
import { Copy, Download, Sparkles, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { MarkdownReader } from '@/components/data-display/markdown-reader'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Button } from '@/components/ui/button'
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker'
import { Message, MessageAvatar, MessageContent, MessageFooter, MessageHeader } from '@/components/ui/message'
import { MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem, MessageScrollerProvider, MessageScrollerViewport } from '@/components/ui/message-scroller'
import { Spinner } from '@/components/ui/spinner'
import { useAsyncData } from '@/hooks/use-async-data'
import { getGeminiMessage } from '@/lib/api/gemini'
import { writeClipboard } from '@/lib/platform/clipboard'
import { safeFilename, saveBlob } from '@/lib/platform/download'
import type { GeminiJob, GeminiMessageSummary } from '@/types/gemini'
import { GeminiUsage } from './gemini-usage'

export function GeminiTranscript({ job, segment }: { job: GeminiJob; segment: GeminiMessageSummary }) {
  const result = useAsyncData((signal) => getGeminiMessage(job.id, segment.id, signal),
    [job.id, segment.id, segment.status, segment.updated], {
      pollMs: segment.status === 'queued' || segment.status === 'running' ? 3000 : undefined,
    })
  const message = result.data
  if (!message) return <div className="p-5">
    <ErrorAlert>{result.error}</ErrorAlert>
    {result.error ? <Button variant="outline" onClick={() => void result.reload()}>重新加载回复</Button> : <LoadingState label="加载消息…" />}
  </div>
  const pending = message.status === 'queued' || message.status === 'running'
  async function copy() {
    if (await writeClipboard(message!.reply)) toast.success('回复已复制')
    else toast.error('复制失败，请重试')
  }
  return <MessageScrollerProvider autoScroll defaultScrollPosition="last-anchor">
    <MessageScroller aria-label="消息对话" className="flex-1">
      <MessageScrollerViewport>
        <MessageScrollerContent className="mx-auto max-w-3xl gap-9 px-4 py-6 sm:px-8 sm:py-9">
          <MessageScrollerItem messageId={`${message.id}-question`} scrollAnchor>
            <Message align="end">
              <MessageContent>
                <MessageHeader><UserRound className="me-1.5 size-3.5" />你</MessageHeader>
                <Bubble variant="muted" align="end" className="max-w-full sm:max-w-[90%]">
                  <BubbleContent className="flex flex-col gap-4 px-4 py-3 text-body leading-7">
                    {job.prompt ? <p className="whitespace-pre-wrap break-words">{job.prompt}</p> : null}
                    {message.inputText ? <div className="whitespace-pre-wrap break-words border-t first:border-t-0 first:pt-0 pt-3">{message.inputText}</div> : null}
                  </BubbleContent>
                </Bubble>
                {job.totalChunks > 1 ? <MessageFooter>{message.sourceName} · 第 {message.part} 段</MessageFooter> : null}
              </MessageContent>
            </Message>
          </MessageScrollerItem>
          <MessageScrollerItem messageId={`${message.id}-answer`}>
            <Message>
              <MessageAvatar className="size-8 self-start translate-y-0! rounded-xl bg-primary-soft text-primary"><Sparkles className="size-4" /></MessageAvatar>
              <MessageContent>
                <MessageHeader className="min-h-8 flex-wrap gap-x-2 gap-y-1 px-0"><span className="text-body font-semibold text-foreground">{isAntigravity(job.model) ? 'Antigravity' : 'Gemini'}</span><span className="break-all text-caption font-normal">{job.options.agent?.model ?? job.model}</span></MessageHeader>
                <Bubble variant="ghost" className="w-full">
                  <BubbleContent className="w-full text-body leading-7">
                    {message.reply ? <MarkdownReader markdown={message.reply} /> : pending ?
                      <Marker role="status"><MarkerIcon><Spinner /></MarkerIcon><MarkerContent>{message.status === 'queued' ? '等待发送…' : isAntigravity(job.model) ? 'Agent 正在执行…' : '正在生成回复…'}</MarkerContent></Marker> :
                      <p className="text-muted-foreground">{message.status === 'canceled' ? '消息已取消。' : '没有收到回复。'}</p>}
                  </BubbleContent>
                </Bubble>
                <ErrorAlert>{message.error || result.error}</ErrorAlert>
                {message.reply ? <MessageFooter className="flex-wrap gap-1 px-0">
                  <Button type="button" variant="ghost" size="icon-touch" aria-label="复制回复" onClick={() => void copy()}><Copy /></Button>
                  <Button type="button" variant="ghost" size="icon-touch" aria-label="下载回复" onClick={() => saveBlob(new Blob([message.reply], { type: 'text/markdown;charset=utf-8' }), safeFilename(job.title, 'Gemini 回复', 'md'))}><Download /></Button>
                  <GeminiUsage usage={message.usage} />
                  {message.finishReason === 'MAX_TOKENS' && !message.error ? <span className="text-warning">达到输出上限</span> : null}
                </MessageFooter> : null}
              </MessageContent>
            </Message>
          </MessageScrollerItem>
        </MessageScrollerContent>
      </MessageScrollerViewport>
      <MessageScrollerButton aria-label="滚动到最新回复" />
    </MessageScroller>
  </MessageScrollerProvider>
}
