import { useState } from 'react'
import { Copy, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { MarkdownReader } from '@/components/data-display/markdown-reader'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Modal, ModalBody, ModalContent, ModalDescription, ModalHeader, ModalTitle } from '@/components/ui/modal'
import { useAsyncData } from '@/hooks/use-async-data'
import { getGeminiJob, getGeminiMessage, listGeminiMessages } from '@/lib/api/gemini'
import { writeClipboard } from '@/lib/platform/clipboard'
import { geminiTextKind } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { TaskStatusBadge } from '@/features/tasks'
import type { GeminiJob } from '@/types/gemini'

const LABELS: Record<string, string> = { queued: '待发送', running: '生成中', succeeded: '已保存', failed: '失败', canceled: '已取消' }

export function GeminiJobSheet({ jobId, onClose }: { jobId: string | null; onClose: () => void }) {
  return <Modal open={Boolean(jobId)} onOpenChange={open => { if (!open) onClose() }}>
    <ModalContent size="lg" height="fixed">
      <ModalHeader><ModalTitle>Gemini 回复</ModalTitle><ModalDescription>逐段查看已保存的正文、回复与错误</ModalDescription></ModalHeader>
      <ModalBody>{jobId ? <JobContents key={jobId} id={jobId} /> : null}</ModalBody>
    </ModalContent>
  </Modal>
}

function JobContents({ id }: { id: string }) {
  const [selected, setSelected] = useState<string | null>(null)
  const job = useAsyncData(signal => getGeminiJob(id, signal), [id], { pollMs: data => data && geminiTextKind.isTerminal(data.status) ? 30000 : 5000 })
  const messages = useAsyncData(signal => listGeminiMessages(id, signal), [id], { pollMs: job.data && geminiTextKind.isTerminal(job.data.status) ? 30000 : 5000 })
  const opened = messages.data?.find(message => message.id === selected)
  return <div className="flex min-w-0 flex-col gap-5">
    <ErrorAlert>{job.error || messages.error}</ErrorAlert>
    {job.data ? <JobSummary job={job.data} /> : null}
    {messages.loading && !messages.data ? <LoadingState label="加载分段…" /> : null}
    <div className="flex min-w-0 flex-wrap gap-2" aria-label="分段列表">
      {messages.data?.map(message => <Button key={message.id} type="button" variant={selected === message.id ? 'secondary' : 'outline'} onClick={() => setSelected(message.id)} aria-pressed={selected === message.id} className="max-w-full">
        <span className="truncate">第 {message.index} 段 · {message.sourceName}</span><span className="shrink-0">{LABELS[message.status] || message.status}</span>
      </Button>)}
    </div>
    {!selected && messages.data?.length ? <p className="text-body text-muted-foreground">选择分段查看回复。</p> : null}
    {selected ? <MessageContents key={selected} jobId={id} messageId={selected} status={opened?.status || ''} /> : null}
  </div>
}

function JobSummary({ job }: { job: GeminiJob }) {
  return <section className="flex min-w-0 flex-col gap-3">
    <h3 className="break-all text-body font-medium">{job.title}</h3>
    <div className="flex min-w-0 flex-wrap items-center gap-3 text-caption text-muted-foreground"><TaskStatusBadge kind={geminiTextKind} record={job} /><span>{job.completedChunks} / {job.totalChunks} 段已保存</span><span className="break-all">{job.model}</span></div>
    <Collapsible><CollapsibleTrigger asChild><Button variant="ghost" size="sm">查看发送设置</Button></CollapsibleTrigger><CollapsibleContent><div className="flex min-w-0 flex-col gap-3 py-3 text-caption"><p>并发 {job.options.concurrency} · 最大输出 {job.options.maxOutputTokens} Token · 思考程度 {job.options.thinkingLevel || '模型默认'}</p><p className="break-all">分隔符：{job.delimiter}</p><p className="whitespace-pre-wrap break-words">提示词：{job.prompt || '空'}</p>{job.systemPrompt ? <p className="whitespace-pre-wrap break-words">系统提示词：{job.systemPrompt}</p> : null}</div></CollapsibleContent></Collapsible>
    {/^\d+$/u.test(job.githubRunId) ? <Button asChild variant="link" className="self-start"><a href={`https://github.com/ActiveInsighter/file-converter-ai/actions/runs/${job.githubRunId}`} target="_blank" rel="noreferrer"><ExternalLink data-icon="inline-start" />运行详情</a></Button> : null}
  </section>
}

function MessageContents({ jobId, messageId, status }: { jobId: string; messageId: string; status: string }) {
  const result = useAsyncData(signal => getGeminiMessage(jobId, messageId, signal), [jobId, messageId, status], {
    pollMs: status === 'queued' || status === 'running' ? 5000 : undefined,
  })
  const message = result.data
  async function copy() {
    if (message && await writeClipboard(message.reply)) toast.success('回复已复制')
    else toast.error('复制失败，请重试')
  }
  return <section className="flex min-w-0 flex-col gap-4" aria-label="分段详情">
    <ErrorAlert>{result.error}</ErrorAlert>
    {result.loading && !message ? <LoadingState label="加载回复…" /> : null}
    {message ? <>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><h3 className="text-body font-medium">第 {message.index} 段 · {LABELS[message.status] || message.status}</h3>{message.reply ? <Button type="button" variant="outline" size="sm" onClick={() => void copy()}><Copy data-icon="inline-start" />复制回复</Button> : null}</div>
      {message.error ? <p role="alert" className="text-body break-words text-danger">{message.error}</p> : null}
      <Collapsible><CollapsibleTrigger asChild><Button type="button" variant="ghost" size="sm">查看原始正文</Button></CollapsibleTrigger><CollapsibleContent><pre className="max-h-64 overflow-y-auto py-3 text-caption whitespace-pre-wrap break-words font-sans">{message.inputText || '仅发送提示词'}</pre></CollapsibleContent></Collapsible>
      {message.reply ? <div className={cn('min-w-0', message.error && 'border-s-2 border-warning ps-3')}><MarkdownReader markdown={message.reply} /></div> : <p role="status" className="text-body text-muted-foreground">{message.status === 'queued' || message.status === 'running' ? '等待回复，保存后自动显示。' : '此分段没有已保存的回复。'}</p>}
      {message.usage?.totalTokenCount ? <p className="text-caption text-muted-foreground">总 Token：{message.usage.totalTokenCount}</p> : null}
    </> : null}
  </section>
}
