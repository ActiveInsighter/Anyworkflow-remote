import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { RunListFilter } from '@/lib/api'

export const RUN_FILTERS: ReadonlyArray<{ value: RunListFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'draft', label: '草稿' },
  { value: 'active', label: '进行中' },
  { value: 'done', label: '已完成' },
  { value: 'failed', label: '失败' },
  { value: 'canceled', label: '取消' },
]

export function isRunListFilter(value: string | null): value is RunListFilter {
  return RUN_FILTERS.some((filter) => filter.value === value)
}

/** Status filter on the page divider; spreads evenly on mobile, packs left on desktop. */
export function RunFilterTabs({ value, onValueChange }: { value: RunListFilter; onValueChange: (value: RunListFilter) => void }) {
  return (
    <Tabs value={value} onValueChange={(next) => onValueChange(isRunListFilter(next) ? next : 'all')}>
      <TabsList variant="line" aria-label="运行状态" className="grid w-full grid-cols-6 gap-0 sm:flex sm:w-fit sm:gap-5">
        {RUN_FILTERS.map((filter) => (
          <TabsTrigger key={filter.value} value={filter.value}>
            {filter.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
