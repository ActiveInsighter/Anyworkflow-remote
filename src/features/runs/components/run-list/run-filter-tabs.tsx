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

/** Status filter as a segmented control; spreads evenly on mobile, packs to its labels on desktop. */
export function RunFilterTabs({ value, onValueChange }: { value: RunListFilter; onValueChange: (value: RunListFilter) => void }) {
  return (
    <Tabs value={value} onValueChange={(next) => onValueChange(isRunListFilter(next) ? next : 'all')}>
      <TabsList aria-label="运行状态" className="grid h-touch w-full grid-cols-6 sm:flex sm:h-9 sm:w-fit">
        {RUN_FILTERS.map((filter) => (
          <TabsTrigger key={filter.value} value={filter.value} className="px-1 group-data-[variant=default]/tabs-list:h-full sm:px-3">
            {filter.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
