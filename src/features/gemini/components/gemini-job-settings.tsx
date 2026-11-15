import { isAntigravity, ANTIGRAVITY_DEFAULTS, ANTIGRAVITY_AGENT_ID } from '@/lib/domain/gemini-agent'
import { ExternalLink, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal, ModalBody, ModalContent, ModalHeader, ModalTitle, ModalTrigger } from '@/components/ui/modal'
import type { GeminiJob } from '@/types/gemini'

export function GeminiJobSettings({ job }: { job: GeminiJob }) {
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
            {isAntigravity(job.model) ? <>
              <dt className="text-muted-foreground">Agent</dt><dd className="break-all">{job.options.agent?.id ?? ANTIGRAVITY_AGENT_ID}</dd>
              <dt className="text-muted-foreground">推理模型</dt><dd>{job.options.agent?.model ?? ANTIGRAVITY_DEFAULTS.agentModel}</dd>
              <dt className="text-muted-foreground">Token 预算</dt><dd>{job.options.agent?.maxTotalTokens || '默认 20,000 Token'}</dd>
              <dt className="text-muted-foreground">执行时限</dt><dd>{job.options.agent?.timeoutMinutes ?? 175} 分钟</dd>
              <dt className="text-muted-foreground">工具与网络</dt><dd>代码、文件、搜索、网页；不限制出站域名</dd>
            </> : <>
            <dt className="text-muted-foreground">输出上限</dt>
            <dd>{job.options.maxOutputTokens.toLocaleString()} Token</dd>
            <dt className="text-muted-foreground">思考程度</dt>
            <dd>{job.options.thinkingLevel || '模型默认'}</dd>
            </>}
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

