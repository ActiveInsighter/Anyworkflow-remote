import { useEffect, useState } from 'react'
import { BarChart3, Bot, Check, ChevronDown, Copy, Download, FileText, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { MarkdownReader } from '@/components/data-display/markdown-reader'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { SegmentRail } from '@/components/data-display/segment-rail'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Button } from '@/components/ui/button'
import { Message, MessageAvatar, MessageContent, MessageFooter, MessageHeader } from '@/components/ui/message'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/components/ui/message-scroller'
import { Spinner } from '@/components/ui/spinner'
import { useAsyncData } from '@/hooks/use-async-data'
import { getGeminiMessage } from '@/lib/api/gemini'
import { isAntigravity } from '@/lib/domain/gemini-agent'
import { writeClipboard } from '@/lib/platform/clipboard'
import { safeFilename, saveBlob } from '@/lib/platform/download'
import type { GeminiJob, GeminiMessageSummary } from '@/types/gemini'

export function GeminiTranscript({ job, segment }: { job: GeminiJob; segment: GeminiMessageSummary }) {
  const [copied, setCopied] = useState(false)
  const [usageOpen, setUsageOpen] = useState(false)
  const result = useAsyncData((signal) => getGeminiMessage(job.id, segment.id, signal),
    [job.id, segment.id, segment.status, segment.updated], {
      pollMs: segment.status === 'queued' || segment.status === 'running' ? 3000 : undefined,
    })
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1800)
    return () => window.clearTimeout(timer)
  }, [copied])

  const message = result.data
  if (!message) {
    return (
      <div className="p-5">
        <ErrorAlert>{result.error}</ErrorAlert>
        {result.error ? (
          <Button variant="outline" onClick={() => void result.reload()}>
            重新加载回复
          </Button>
        ) : (
          <LoadingState label="加载消息…" />
        )}
      </div>
    )
  }

  const pending = message.status === 'queued' || message.status === 'running'
  const agent = isAntigravity(job.model)
  const modelLabel = job.options.agent?.model ?? job.model

  async function copy() {
    if (await writeClipboard(message!.reply)) {
      setCopied(true)
      toast.success('回复已复制')
    } else {
      toast.error('复制失败，请重试')
    }
  }

  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller aria-label="消息对话" className="flex-1">
        <MessageScrollerViewport>
          <MessageScrollerContent className="mx-auto max-w-3xl gap-6 px-4 py-5 sm:px-8 sm:py-7">
            <MessageScrollerItem messageId={`${message.id}-question`} scrollAnchor>
              <Message align="end">
                <MessageContent>
                  <Bubble variant="secondary" align="end" className="max-w-[95%] sm:max-w-[82%]">
                    <BubbleContent className="space-y-3 rounded-2xl rounded-ee-sm border border-border/70 px-4 py-3 text-body shadow-2xs">
                      {job.prompt ? <p className="whitespace-pre-wrap break-words leading-relaxed">{job.prompt}</p> : null}
                      {message.inputText ? (
                        <div className="overflow-hidden rounded-xl border border-border/60 bg-background/80">
                          <div className="flex items-center gap-1.5 border-b border-border/50 bg-subtle/60 px-3 py-1.5 text-caption font-medium text-muted-foreground">
                            <FileText aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
                            <span className="truncate">{message.sourceName}</span>
                            {job.totalChunks > 1 ? <span className="shrink-0 tabular-nums">· 第 {message.part} 段</span> : null}
                          </div>
                          <div className="max-h-56 overflow-y-auto px-3 py-2.5 text-caption leading-relaxed text-foreground/90 whitespace-pre-wrap break-words">
                            {message.inputText}
                          </div>
                        </div>
                      ) : null}
                    </BubbleContent>
                  </Bubble>
                  {job.totalChunks > 1 && !message.inputText ? (
                    <MessageFooter className="px-1">
                      {message.sourceName} · 第 {message.part} 段
                    </MessageFooter>
                  ) : null}
                </MessageContent>
              </Message>
            </MessageScrollerItem>

            <MessageScrollerItem messageId={`${message.id}-answer`}>
              <Message className="gap-3">
                <MessageAvatar className="size-8 self-start translate-y-0! rounded-xl border border-primary/15 bg-primary-soft text-primary">
                  {agent ? <Bot className="size-4" /> : <Sparkles className="size-4" />}
                </MessageAvatar>
                <MessageContent className="gap-3">
                  <MessageHeader className="min-h-8 flex-wrap gap-2 px-0">
                    <span className="text-body font-semibold text-foreground">{agent ? 'Antigravity' : 'Gemini'}</span>
                    <span className="inline-flex max-w-full items-center truncate rounded-md border border-border/70 bg-subtle/70 px-2 py-0.5 text-caption font-normal text-muted-foreground">
                      {modelLabel}
                    </span>
                    {message.finishReason === 'MAX_TOKENS' && !message.error ? (
                      <span className="inline-flex items-center rounded-md bg-warning/15 px-2 py-0.5 text-caption font-medium text-warning">
                        达到输出上限
                      </span>
                    ) : null}
                  </MessageHeader>

                  <Bubble variant="ghost" className="w-full">
                    <BubbleContent className="w-full text-body">
                      {message.reply ? (
                        <MarkdownReader markdown={message.reply} className="mx-0 max-w-[44rem]" />
                      ) : pending ? (
                        <div
                          role="status"
                          className="flex flex-col gap-3 rounded-xl border border-border/70 bg-subtle/60 px-4 py-3.5"
                        >
                          <div className="flex items-center gap-2.5 text-body font-medium text-foreground">
                            <Spinner className="size-4 text-primary" />
                            <span>
                              {message.status === 'queued'
                                ? '等待发送…'
                                : agent
                                  ? 'Agent 正在执行…'
                                  : '正在生成回复…'}
                            </span>
                          </div>
                          <SegmentRail
                            total={1}
                            done={0}
                            live={message.status === 'running'}
                            label={message.status === 'queued' ? '等待发送' : '正在生成'}
                            className="max-w-56"
                          />
                        </div>
                      ) : (
                        <p className="rounded-xl border border-border/60 bg-subtle/40 px-4 py-3 text-body text-muted-foreground">
                          {message.status === 'canceled' ? '消息已取消。' : '没有收到回复。'}
                        </p>
                      )}
                    </BubbleContent>
                  </Bubble>

                  <ErrorAlert>{message.error || result.error}</ErrorAlert>

                  {message.reply ? (
                    <>
                      <MessageFooter className="flex-wrap items-center gap-1.5 px-0 pt-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label="复制回复"
                          onClick={() => void copy()}
                          className="h-8 gap-1.5 px-2.5 text-caption text-muted-foreground hover:text-foreground"
                        >
                          {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
                          <span>{copied ? '已复制' : '复制'}</span>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label="下载回复"
                          onClick={() =>
                            saveBlob(
                              new Blob([message.reply], { type: 'text/markdown;charset=utf-8' }),
                              safeFilename(job.title, 'Gemini 回复', 'md'),
                            )
                          }
                          className="h-8 gap-1.5 px-2.5 text-caption text-muted-foreground hover:text-foreground"
                        >
                          <Download className="size-3.5" />
                          <span>下载</span>
                        </Button>
                        {message.usage?.totalTokenCount ? (
                          <button
                            type="button"
                            aria-expanded={usageOpen}
                            onClick={() => setUsageOpen((open) => !open)}
                            className="ms-1 inline-flex h-8 cursor-pointer select-none items-center gap-1.5 rounded-lg border border-border/70 bg-subtle/60 px-2.5 text-caption font-normal text-muted-foreground tabular-nums outline-none transition-colors hover:bg-subtle hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <BarChart3 aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
                            <span>{message.usage.totalTokenCount.toLocaleString()} Token · 明细</span>
                            <ChevronDown
                              aria-hidden="true"
                              className={`size-3.5 shrink-0 transition-transform duration-fast ${usageOpen ? 'rotate-180' : ''}`}
                            />
                          </button>
                        ) : null}
                      </MessageFooter>
                      {message.usage?.totalTokenCount && usageOpen ? (
                        <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-xl border border-border/70 bg-subtle/50 px-3 py-2 text-caption text-muted-foreground tabular-nums">
                          {message.usage.promptTokenCount != null ? (
                            <span>输入 {message.usage.promptTokenCount.toLocaleString()}</span>
                          ) : null}
                          {message.usage.candidatesTokenCount != null ? (
                            <span>输出 {message.usage.candidatesTokenCount.toLocaleString()}</span>
                          ) : null}
                          {message.usage.thoughtsTokenCount != null ? (
                            <span>思考 {message.usage.thoughtsTokenCount.toLocaleString()}</span>
                          ) : null}
                          {message.usage.toolUseTokenCount != null ? (
                            <span>工具 {message.usage.toolUseTokenCount.toLocaleString()}</span>
                          ) : null}
                          {message.usage.cachedContentTokenCount != null ? (
                            <span>缓存 {message.usage.cachedContentTokenCount.toLocaleString()}</span>
                          ) : null}
                          {message.usage.agentStepCount != null ? (
                            <span>Agent 步骤 {message.usage.agentStepCount.toLocaleString()}</span>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </MessageContent>
              </Message>
            </MessageScrollerItem>
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton aria-label="滚动到最新回复" />
      </MessageScroller>
    </MessageScrollerProvider>
  )
}
