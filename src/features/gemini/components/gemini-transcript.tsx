import { useState } from 'react'
import { Bot, Check, ChevronDown, Copy, Download, FileText, Sparkles, UserRound } from 'lucide-react'
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
import { isAntigravity } from '@/lib/domain/gemini-agent'
import { writeClipboard } from '@/lib/platform/clipboard'
import { safeFilename, saveBlob } from '@/lib/platform/download'
import { cn } from '@/lib/utils'
import type { GeminiJob, GeminiMessageSummary } from '@/types/gemini'

export function GeminiTranscript({ job, segment }: { job: GeminiJob; segment: GeminiMessageSummary }) {
  const [copied, setCopied] = useState(false)
  const [usageOpen, setUsageOpen] = useState(false)
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
  const agentMode = isAntigravity(job.model)
  async function copy() {
    if (await writeClipboard(message!.reply)) {
      setCopied(true)
      toast.success('回复已复制')
      setTimeout(() => setCopied(false), 1800)
    } else {
      toast.error('复制失败，请重试')
    }
  }
  return <MessageScrollerProvider autoScroll defaultScrollPosition="last-anchor">
    <MessageScroller aria-label="消息对话" className="flex-1">
      <MessageScrollerViewport>
        <MessageScrollerContent className="mx-auto max-w-3xl gap-6 px-4 py-6 sm:px-8 sm:py-8">
          <MessageScrollerItem messageId={`${message.id}-question`} scrollAnchor>
            <Message align="end">
              <MessageContent>
                <MessageHeader className="gap-1.5 px-1">
                  <UserRound className="size-3.5" aria-hidden="true" />
                  <span>你</span>
                </MessageHeader>
                <Bubble variant="secondary" align="end" className="max-w-[94%] sm:max-w-[82%]">
                  <BubbleContent className="space-y-3 rounded-2xl rounded-tr-sm border border-border/60 px-4 py-3 text-body shadow-xs">
                    {job.prompt ? <p className="whitespace-pre-wrap break-words leading-relaxed">{job.prompt}</p> : null}
                    {message.inputText ? (
                      <div className="rounded-xl border border-border/70 bg-background/75 p-3">
                        <div className="flex items-center gap-1.5 text-micro font-medium text-muted-foreground">
                          <FileText className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                          <span className="truncate">
                            {message.sourceName || '附加正文'}
                            {job.totalChunks > 1 ? ` · 第 ${message.part} 段` : ''}
                          </span>
                        </div>
                        <div className="mt-1.5 max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-caption leading-relaxed text-muted-foreground">
                          {message.inputText}
                        </div>
                      </div>
                    ) : null}
                  </BubbleContent>
                </Bubble>
              </MessageContent>
            </Message>
          </MessageScrollerItem>
          <MessageScrollerItem messageId={`${message.id}-answer`}>
            <Message>
              <MessageAvatar className="size-8 self-start translate-y-0! rounded-xl bg-primary-soft text-primary ring-1 ring-primary/15">
                {agentMode ? <Bot className="size-4" /> : <Sparkles className="size-4" />}
              </MessageAvatar>
              <MessageContent className="gap-3">
                <MessageHeader className="min-h-8 gap-2 px-0">
                  <span className="font-semibold text-foreground">{agentMode ? 'Antigravity' : 'Gemini'}</span>
                  <span className="truncate rounded-md border border-border/70 bg-subtle px-2 py-0.5 text-micro font-medium text-muted-foreground">
                    {job.options.agent?.model ?? job.model}
                  </span>
                </MessageHeader>
                <Bubble variant="ghost" className="w-full">
                  <BubbleContent className="w-full text-body">
                    {message.reply ? (
                      <MarkdownReader markdown={message.reply} className="mx-0 max-w-none" />
                    ) : pending ? (
                      <Marker role="status" className="rounded-xl border border-border/70 bg-subtle px-3.5 py-2.5">
                        <MarkerIcon><Spinner /></MarkerIcon>
                        <MarkerContent>
                          {message.status === 'queued' ? '等待发送…' : agentMode ? 'Agent 正在执行…' : '正在生成回复…'}
                        </MarkerContent>
                      </Marker>
                    ) : (
                      <p className="rounded-xl border border-dashed border-border/80 bg-subtle/50 px-3.5 py-2.5 text-muted-foreground">
                        {message.status === 'canceled' ? '消息已取消。' : '没有收到回复。'}
                      </p>
                    )}
                  </BubbleContent>
                </Bubble>
                <ErrorAlert>{message.error || result.error}</ErrorAlert>
                {message.reply ? (
                  <MessageFooter className="flex-col items-start gap-2.5 px-0 pt-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 rounded-lg px-2.5 text-caption"
                        aria-label="复制回复"
                        onClick={() => void copy()}
                      >
                        {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
                        <span>{copied ? '已复制' : '复制'}</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 rounded-lg px-2.5 text-caption"
                        aria-label="下载回复"
                        onClick={() => saveBlob(new Blob([message.reply], { type: 'text/markdown;charset=utf-8' }), safeFilename(job.title, 'Gemini 回复', 'md'))}
                      >
                        <Download className="size-3.5" />
                        <span>下载</span>
                      </Button>
                      {message.usage?.totalTokenCount ? (
                        <button
                          type="button"
                          aria-expanded={usageOpen}
                          onClick={() => setUsageOpen((open) => !open)}
                          className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-caption font-normal text-muted-foreground tabular-nums transition-colors hover:bg-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span>{message.usage.totalTokenCount.toLocaleString()} Token · 明细</span>
                          <ChevronDown className={cn('size-3.5 transition-transform duration-fast', usageOpen && 'rotate-180')} aria-hidden="true" />
                        </button>
                      ) : null}
                      {message.finishReason === 'MAX_TOKENS' && !message.error ? (
                        <span className="rounded-md bg-warning-soft px-2 py-0.5 text-micro font-medium text-warning">
                          达到输出上限
                        </span>
                      ) : null}
                    </div>
                    {usageOpen && message.usage?.totalTokenCount ? (
                      <div className="grid w-full max-w-md grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl border border-border/70 bg-subtle px-3.5 py-2.5 text-caption font-normal text-muted-foreground tabular-nums sm:grid-cols-3">
                        {message.usage.promptTokenCount != null ? <span>输入 {message.usage.promptTokenCount.toLocaleString()}</span> : null}
                        {message.usage.candidatesTokenCount != null ? <span>输出 {message.usage.candidatesTokenCount.toLocaleString()}</span> : null}
                        {message.usage.thoughtsTokenCount != null ? <span>思考 {message.usage.thoughtsTokenCount.toLocaleString()}</span> : null}
                        {message.usage.toolUseTokenCount != null ? <span>工具 {message.usage.toolUseTokenCount.toLocaleString()}</span> : null}
                        {message.usage.cachedContentTokenCount != null ? <span>缓存 {message.usage.cachedContentTokenCount.toLocaleString()}</span> : null}
                        {message.usage.agentStepCount != null ? <span>Agent 步骤 {message.usage.agentStepCount.toLocaleString()}</span> : null}
                      </div>
                    ) : null}
                  </MessageFooter>
                ) : null}
              </MessageContent>
            </Message>
          </MessageScrollerItem>
        </MessageScrollerContent>
      </MessageScrollerViewport>
      <MessageScrollerButton aria-label="滚动到最新回复" />
    </MessageScroller>
  </MessageScrollerProvider>
}
