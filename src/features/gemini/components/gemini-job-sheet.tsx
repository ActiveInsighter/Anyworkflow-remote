import { useState } from 'react'
import { Copy, ExternalLink, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { MarkdownReader } from '@/components/data-display/markdown-reader'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { Button } from '@/components/ui/button'
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  ModalPane,
  ModalSplit,
  ModalTag,
  ModalTags,
  ModalTitle,
  ModalToolbar,
  ModalTrigger,
} from '@/components/ui/modal'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAsyncData } from '@/hooks/use-async-data'
import { getGeminiJob, getGeminiMessage, listGeminiMessages } from '@/lib/api/gemini'
import { writeClipboard } from '@/lib/platform/clipboard'
import { geminiTextKind } from '@/lib/tasks'
import { TaskStatusBadge } from '@/features/tasks'
import type { GeminiJob } from '@/types/gemini'
import { SegmentNavigation } from './segment-navigation'

export function GeminiJobSheet({ jobId, onClose }: { jobId: string | null; onClose: () => void }) {
  return (
    <Modal
      open={Boolean(jobId)}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <ModalContent size="xl" height="fixed">
        {jobId ? (
          <JobContents key={jobId} id={jobId} />
        ) : (
          <ModalHeader>
            <ModalTitle>消息回复</ModalTitle>
          </ModalHeader>
        )}
      </ModalContent>
    </Modal>
  )
}

function JobContents({ id }: { id: string }) {
  const [selected, setSelected] = useState('')
  const job = useAsyncData((signal) => getGeminiJob(id, signal), [id], {
    pollMs: (data) => (data && geminiTextKind.isTerminal(data.status) ? 30000 : 5000),
  })
  const messages = useAsyncData((signal) => listGeminiMessages(id, signal), [id], {
    pollMs: job.data && geminiTextKind.isTerminal(job.data.status) ? 30000 : 5000,
  })
  const opened = messages.data?.find((message) => message.id === selected) ?? messages.data?.[0]
  return (
    <>
      <ModalHeader>
        <ModalTitle>{job.data?.title || '消息回复'}</ModalTitle>
        <ModalTags>
          {job.data ? (
            <>
              <TaskStatusBadge kind={geminiTextKind} record={job.data} />
              <ModalTag>
                {job.data.completedChunks} / {job.data.totalChunks} 段
              </ModalTag>
            </>
          ) : null}
        </ModalTags>
        <ModalToolbar>{job.data ? <JobSettings job={job.data} /> : null}</ModalToolbar>
      </ModalHeader>
      <ModalSplit className="max-md:flex max-md:flex-col" columns="16rem minmax(0,1fr)">
        <ModalPane tone="muted" className="max-md:py-3">
          <ErrorAlert>{messages.error || job.error}</ErrorAlert>
          {messages.loading && !messages.data ? <LoadingState label="加载分段…" /> : null}
          <SegmentNavigation items={messages.data ?? []} value={opened?.id ?? ''} onChange={setSelected} />
        </ModalPane>
        <ModalPane>
          {opened ? (
            <MessageContents
              key={opened.id}
              jobId={id}
              messageId={opened.id}
              status={opened.status}
              prompt={job.data?.prompt || ''}
            />
          ) : (
            <LoadingState label="加载回复…" />
          )}
        </ModalPane>
      </ModalSplit>
    </>
  )
}

function JobSettings({ job }: { job: GeminiJob }) {
  return (
    <Modal>
      <ModalTrigger
        render={<Button type="button" variant="ghost" size="icon-touch" aria-label="查看发送设置" />}
      >
        <SlidersHorizontal />
      </ModalTrigger>
      <ModalContent size="md">
        <ModalHeader>
          <ModalTitle>发送设置</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-3 text-body">
            <dt className="text-muted-foreground">模型</dt>
            <dd className="break-all">{job.model}</dd>
            <dt className="text-muted-foreground">并发</dt>
            <dd>{job.options.concurrency}</dd>
            <dt className="text-muted-foreground">输出上限</dt>
            <dd>{job.options.maxOutputTokens.toLocaleString()} Token</dd>
            <dt className="text-muted-foreground">思考程度</dt>
            <dd>{job.options.thinkingLevel || '模型默认'}</dd>
            <dt className="text-muted-foreground">分隔符</dt>
            <dd className="break-all font-mono text-caption">{job.delimiter}</dd>
          </dl>
          {job.systemPrompt ? (
            <section className="mt-6">
              <h3 className="mb-2 text-caption font-medium text-muted-foreground">系统提示词</h3>
              <p className="whitespace-pre-wrap break-words text-body">{job.systemPrompt}</p>
            </section>
          ) : null}
          {/^\d+$/u.test(job.githubRunId) ? (
            <Button asChild variant="link" className="mt-6">
              <a
                href={`https://github.com/ActiveInsighter/file-converter-ai/actions/runs/${job.githubRunId}`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink data-icon="inline-start" />
                运行详情
              </a>
            </Button>
          ) : null}
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}

function MessageContents({
  jobId,
  messageId,
  status,
  prompt,
}: {
  jobId: string
  messageId: string
  status: string
  prompt: string
}) {
  const result = useAsyncData(
    (signal) => getGeminiMessage(jobId, messageId, signal),
    [jobId, messageId, status],
    { pollMs: status === 'queued' || status === 'running' ? 5000 : undefined },
  )
  const message = result.data
  async function copy() {
    if (message && (await writeClipboard(message.reply))) toast.success('回复已复制')
    else toast.error('复制失败，请重试')
  }
  return (
    <section className="min-w-0" aria-label="分段详情">
      <ErrorAlert>{result.error}</ErrorAlert>
      {result.loading && !message ? <LoadingState label="加载回复…" /> : null}
      {message ? (
        <Tabs defaultValue="reply" className="gap-6">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <TabsList>
              <TabsTrigger value="reply">回复</TabsTrigger>
              <TabsTrigger value="input">原文</TabsTrigger>
            </TabsList>
            {message.reply ? (
              <Button type="button" variant="ghost" size="touch" onClick={() => void copy()}>
                <Copy data-icon="inline-start" />
                复制回复
              </Button>
            ) : null}
          </div>
          <TabsContent value="reply" className="min-w-0">
            <ErrorAlert className="mb-4">{message.error}</ErrorAlert>
            {message.reply ? (
              <MarkdownReader markdown={message.reply} />
            ) : (
              <p role="status" className="py-8 text-body text-muted-foreground">
                {message.status === 'queued' || message.status === 'running'
                  ? '正在等待回复，保存后会自动显示。'
                  : '此分段没有已保存的回复。'}
              </p>
            )}
            {message.usage?.totalTokenCount ? (
              <p className="mt-8 text-caption text-muted-foreground">
                {message.usage.totalTokenCount.toLocaleString()} Token
              </p>
            ) : null}
          </TabsContent>
          <TabsContent value="input" className="min-w-0 space-y-6">
            {prompt ? (
              <section>
                <h3 className="mb-2 text-caption font-medium text-muted-foreground">共同提示词</h3>
                <p className="whitespace-pre-wrap break-words text-body">{prompt}</p>
              </section>
            ) : null}
            <section>
              <h3 className="mb-2 text-caption font-medium text-muted-foreground">分段正文</h3>
              <pre className="whitespace-pre-wrap break-words font-sans text-body leading-relaxed">
                {message.inputText || '仅发送提示词'}
              </pre>
            </section>
          </TabsContent>
        </Tabs>
      ) : null}
    </section>
  )
}
