import { SelectField, SelectOption } from '@/components/ui/select'
import { Check, Circle, CircleX, LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SegmentItem {
  id: string
  index: number
  sourceName: string
  part: number
  status?: string
}
const LABELS: Record<string, string> = {
  queued: '待发送',
  running: '生成中',
  succeeded: '已保存',
  failed: '失败',
  canceled: '已取消',
}
export function SegmentNavigation({
  items,
  value,
  onChange,
  compact = false,
}: {
  items: SegmentItem[]
  value: string
  onChange: (id: string) => void
  compact?: boolean
}) {
  return (
    <>
      <div className={compact ? 'xl:hidden' : 'md:hidden'}>
        <SelectField aria-label="选择分段" value={value} onValueChange={(value) => onChange(value)}>
          {items.map((item) => (
            <SelectOption key={item.id} value={item.id}>
              {item.index}. {item.sourceName} · 第 {item.part} 段
              {item.status ? ` · ${LABELS[item.status] || item.status}` : ''}
            </SelectOption>
          ))}
        </SelectField>
      </div>
      <nav aria-label="分段列表" className={cn('hidden flex-col gap-1', compact ? 'xl:flex' : 'md:flex')}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={item.id === value ? 'true' : undefined}
            onClick={() => onChange(item.id)}
            className={cn(
              'flex min-h-touch min-w-0 items-start gap-3 rounded-lg px-3 py-3 text-start outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
              item.id === value
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
            )}
          >
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-background text-caption tabular-nums">{item.index}</span>
            <span className="min-w-0">
              <span className="block truncate text-body font-medium">{item.sourceName}</span>
              <span className="mt-1 flex items-center gap-1.5 text-caption">
                {item.status === 'succeeded' ? <Check className="size-3 text-success" /> : item.status === 'failed' ? <CircleX className="size-3 text-danger" /> : item.status === 'running' ? <LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" /> : item.status ? <Circle className="size-3" /> : null}
                第 {item.part} 段{item.status ? ` · ${LABELS[item.status] || item.status}` : ''}
              </span>
            </span>
          </button>
        ))}
      </nav>
    </>
  )
}
