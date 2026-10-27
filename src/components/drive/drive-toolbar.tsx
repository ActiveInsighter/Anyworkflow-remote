import { ArrowDown, ArrowUp, LayoutGrid, List } from 'lucide-react'
import { SearchField } from '@/components/form/search-field'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { DriveSort, DriveSortField, DriveViewMode } from './drive-types'

const FIELD_LABELS: Record<DriveSortField, string> = { name: '名称', updated: '修改时间', size: '大小' }

/** Search across every folder; below it, the sort order and the list/grid switch. */
export function DriveSearch({ value, onValueChange, label }: { value: string; onValueChange: (value: string) => void; label: string }) {
  return (
    <SearchField
      label={label}
      clearLabel="清空搜索"
      value={value}
      onValueChange={onValueChange}
      size="touch"
      className="h-12 rounded-full border-transparent bg-muted/70 px-1.5 shadow-none sm:h-11 has-[input:focus-visible]:bg-background"
    />
  )
}

export function DriveSortBar({
  sort,
  onSortChange,
  fields = ['name', 'updated'],
  view,
  onViewChange,
}: {
  sort: DriveSort
  onSortChange: (sort: DriveSort) => void
  fields?: DriveSortField[]
  view: DriveViewMode
  onViewChange: (view: DriveViewMode) => void
}) {
  const Arrow = sort.direction === 'asc' ? ArrowUp : ArrowDown
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-0.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="touch" className="-ms-2 gap-1.5 px-2.5 font-medium sm:h-9">
              {FIELD_LABELS[sort.field]}
              <span className="sr-only">排序，当前{sort.direction === 'asc' ? '升序' : '降序'}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-40">
            <DropdownMenuLabel>排序方式</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={sort.field}
              onValueChange={(field) => onSortChange({ ...sort, field: field as DriveSortField })}
            >
              {fields.map((field) => (
                <DropdownMenuRadioItem key={field} value={field}>
                  {FIELD_LABELS[field]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={sort.direction}
              onValueChange={(direction) => onSortChange({ ...sort, direction: direction === 'desc' ? 'desc' : 'asc' })}
            >
              <DropdownMenuRadioItem value="asc">升序</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="desc">降序</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon-touch"
          className="rounded-full bg-primary-soft text-primary hover:bg-primary-soft/80 hover:text-primary sm:size-9"
          aria-label={sort.direction === 'asc' ? '改为降序' : '改为升序'}
          onClick={() => onSortChange({ ...sort, direction: sort.direction === 'asc' ? 'desc' : 'asc' })}
        >
          <Arrow />
        </Button>
      </div>
      <ToggleGroup
        type="single"
        variant="segmented"
        aria-label="视图"
        value={view}
        onValueChange={(next) => {
          if (next) onViewChange(next as DriveViewMode)
        }}
        className="h-10 rounded-full sm:h-9"
      >
        <ToggleGroupItem value="list" aria-label="列表视图" className="rounded-full px-3.5">
          <List />
        </ToggleGroupItem>
        <ToggleGroupItem value="grid" aria-label="网格视图" className="rounded-full px-3.5">
          <LayoutGrid />
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  )
}
