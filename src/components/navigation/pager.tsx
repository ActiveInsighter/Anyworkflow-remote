import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Previous/next pagination with a position readout. Renders nothing for a single page.
 * Used for every paged list so the controls read and behave the same everywhere.
 */
export function Pager({
  page,
  totalPages,
  totalItems,
  onPageChange,
  disabled = false,
  label = '分页',
  className,
}: {
  page: number
  totalPages: number
  totalItems?: number
  onPageChange: (page: number) => void
  disabled?: boolean
  label?: string
  className?: string
}) {
  if (totalPages <= 1) return null
  return (
    <nav
      aria-label={label}
      className={cn('mt-3 flex items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground', className)}
    >
      <span className="tabular-nums">
        {totalItems !== undefined ? `${totalItems} 条 · ` : ''}
        {page}/{totalPages} 页
      </span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" disabled={disabled || page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft data-icon="inline-start" />
          上一页
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          下一页
          <ChevronRight data-icon="inline-end" />
        </Button>
      </div>
    </nav>
  )
}
