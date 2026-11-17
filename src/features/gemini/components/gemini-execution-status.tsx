import { ExternalLink } from 'lucide-react'
import { useNow } from '@/hooks/use-now'
import type { GeminiJob, GeminiMessage } from '@/types/gemini'

function ageLabel(value: string | undefined, now: number) {
  const elapsed = value ? now - Date.parse(value) : NaN
  if (!Number.isFinite(elapsed)) return '尚未收到'
  const seconds = Math.max(0, Math.floor(elapsed / 1000))
  return seconds < 60 ? `${seconds} 秒前` : `${Math.floor(seconds / 60)} 分钟前`
}

/** Only executor progress uploads prove contact; job.updated is scheduler-owned. */
export function GeminiExecutionStatus({ job, message, connectionError }: {
  job: GeminiJob
  message: GeminiMessage | null
  connectionError: boolean
}) {
  const now = useNow(10_000)
  const heartbeat = Date.parse(message?.progressAt || '')
  const online = Number.isFinite(heartbeat) && now - heartbeat < 90_000
  // Status-only uploads do not mean the agent has produced a new step.
  const latestStep = message?.agentParts?.filter(part => part.type !== 'status')
    .reduce<string | undefined>((latest, part) => !latest || Date.parse(part.updated) > Date.parse(latest) ? part.updated : latest, undefined)
  const label = connectionError ? '连接异常，正在重试' : job.status === 'queued' ? '排队中'
    : online ? '执行器在线' : '暂未收到执行器心跳'
  return <div className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-2 text-xs text-muted-foreground md:px-5" data-testid="gemini-execution-status">
    <div className="min-w-0">
      <p role="status">{label}</p>
      <p className="mt-1 break-words">心跳：{ageLabel(message?.progressAt, now)} · 最近步骤：{ageLabel(latestStep, now)}</p>
    </div>
    {/^[0-9]+$/.test(job.githubRunId) ? <a href={`https://github.com/ActiveInsighter/file-converter-ai/actions/runs/${job.githubRunId}`}
      target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline focus-visible:outline-ring">
      运行日志<ExternalLink aria-hidden="true" className="size-3" />
    </a> : null}
  </div>
}
