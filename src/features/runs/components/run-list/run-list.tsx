import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { RUN_LIST_COLUMNS } from './run-list-columns'

/** Records straight on the page, with a column header that only appears where columns exist. */
export function RunList({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-3 flex min-w-0 flex-col">
      <div
        aria-hidden="true"
        className={cn(
          'hidden items-center gap-4 border-b px-3 pb-2 text-caption font-medium text-muted-foreground lg:grid',
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
    </div>
  )
}
