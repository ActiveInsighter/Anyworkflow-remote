import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Brain, ChevronDown, Terminal, Wrench } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { MarkdownReader } from '@/components/data-display/markdown-reader'
import type { AgentPart, GeminiMessage } from '@/types/gemini'

const labels = { reasoning_summary: '思考摘要', tool_call: '工具调用', tool_result: '工具结果', status: '执行状态', text: '回复' }

export function AgentTimeline({ parts, pending, showText }: { parts: AgentPart[]; pending: boolean; showText: boolean }) {
  const [visibleCount, setVisibleCount] = useState(100)
  // Status and heartbeat are shown once in the footer, separate from content.
  const visible = parts.filter(part => part.type !== 'status' && (showText || part.type !== 'text'))
  if (!visible.length) return null
  return <ol aria-label="Agent 执行过程" className="mb-4 flex min-w-0 flex-col gap-3">
    {visible.length > visibleCount ? <li><Button variant="ghost" onClick={() => setVisibleCount(count => count + 100)}>查看更早的步骤（{visible.length - visibleCount}）</Button></li> : null}
    {visible.slice(-visibleCount).map(part => <li key={part.key} className="min-w-0">
      {part.type === 'text' ? <MarkdownReader markdown={part.content} /> :
        <Collapsible className="min-w-0 rounded-md border">
          <CollapsibleTrigger className="flex min-h-11 w-full min-w-0 items-center gap-2 px-3 py-2 text-start text-caption hover:bg-muted focus-visible:outline-ring">
            {part.type === 'reasoning_summary' ? <Brain className="size-4 shrink-0" /> : part.type === 'tool_call' ? <Wrench className="size-4 shrink-0" /> : <Terminal className="size-4 shrink-0" />}
            <span className="shrink-0">{labels[part.type]}</span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{part.toolName || part.content.slice(0, 64)}</span>
            <span className="shrink-0 text-muted-foreground">{part.status === 'failed' ? '失败' : part.status === 'running' ? pending ? '进行中' : '已结束' : '已记录'}</span>
            <ChevronDown className="size-3.5 shrink-0" />
          </CollapsibleTrigger>
          <CollapsibleContent className="min-w-0 border-t px-3 py-3">
            {part.callId ? <p className="mb-2 break-all text-caption text-muted-foreground">调用 {part.callId}</p> : null}
            <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words text-caption [overflow-wrap:anywhere]">{part.content || '等待工具内容…'}</pre>
          </CollapsibleContent>
        </Collapsible>}
      {part.truncated ? <p className="mt-1 text-caption text-muted-foreground">过程内容过长，显示已保存的预览。</p> : null}
    </li>)}
  </ol>
}

export function MessageUsage({ usage }: { usage: GeminiMessage['usage'] }) {
  const [expanded, setExpanded] = useState(false)
  const values = [
    ['输入', usage.promptTokenCount], ['输出', usage.candidatesTokenCount], ['思考', usage.thoughtsTokenCount],
    ['工具', usage.toolUseTokenCount], ['缓存', usage.cachedContentTokenCount], ['Agent 步骤', usage.agentStepCount],
  ] as const
  if (usage.totalTokenCount == null && values.every(([, value]) => value == null)) return null
  return <Collapsible open={expanded} onOpenChange={setExpanded} className="text-caption font-normal tabular-nums">
    <CollapsibleTrigger className="min-h-11 cursor-pointer text-start focus-visible:outline-ring">{usage.totalTokenCount != null ? `${usage.totalTokenCount.toLocaleString()} Token · 明细` : 'Token 用量 · 明细'}</CollapsibleTrigger>
    <CollapsibleContent className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
      {values.map(([label, value]) => value != null ? <span key={label}>{label} {value.toLocaleString()}</span> : null)}
    </CollapsibleContent>
  </Collapsible>
}
