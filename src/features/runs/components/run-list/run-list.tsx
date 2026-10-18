import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { RUN_LIST_COLUMNS } from './run-list-columns'

/** Bordered list surface with a column header that only appears where columns exist. */
export function RunList({ children }: { children: ReactNode }) {
  return (
    <Card className="divide-y">
      <div
        aria-hidden="true"
        className={cn(
          'hidden items-center gap-4 bg-muted/50 px-5 py-3 text-caption font-medium text-muted-foreground lg:grid',
          RUN_LIST_COLUMNS,
        )}
      >
        <span>工作流名称</span>
        <span>状态</span>
        <span>任务</span>
        <span>最后更新</span>
        <span />
      </div>
      {children}
    </Card>
  )
}
