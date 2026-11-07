import { CircleCheck, CircleMinus, CircleX, Clock3, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PageOutcome, PageResult } from '../lib/run-results'

const OUTCOME: Record<PageOutcome, { icon: LucideIcon; className: string; label: string }> = {
  succeeded: { icon: CircleCheck, className: 'text-success', label: '成功' },
  failed: { icon: CircleX, className: 'text-danger', label: '失败' },
  canceled: { icon: CircleMinus, className: 'text-muted-foreground', label: '已取消' },
  waiting: { icon: Clock3, className: 'text-muted-foreground', label: '等待中' },
}

/** How one page fared in a run: a mark, its name, and the count or the reason it failed. */
export function PageResultRow({ result, title, facts = [] }: { result: PageResult; title?: string; facts?: string[] }) {
  const state = OUTCOME[result.outcome]
  const Mark = state.icon
  const detail = result.outcome === 'succeeded' ? `${result.itemCount} 条内容` : state.label

  return (
    <li className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 py-2.5">
      <Mark aria-label={state.label} role="img" className={cn('mt-0.5 size-4 shrink-0', state.className)} />
      <div className="min-w-0">
        <p className="min-w-0 truncate text-body font-medium" title={result.item.url}>{title ?? result.title}</p>
        <p className="mt-0.5 flex min-w-0 flex-wrap gap-x-3 text-caption text-muted-foreground tabular-nums">
          {facts.filter(Boolean).map((fact, index) => <span key={index}>{fact}</span>)}
          <span className={cn(result.outcome === 'failed' && 'text-danger')}>{result.error || detail}</span>
        </p>
      </div>
    </li>
  )
}
