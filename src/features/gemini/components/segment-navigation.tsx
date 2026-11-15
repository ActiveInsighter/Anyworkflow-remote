import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
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
}: {
  items: SegmentItem[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <>
      <div className="md:hidden">
        <NativeSelect aria-label="选择分段" value={value} onChange={(event) => onChange(event.target.value)}>
          {items.map((item) => (
            <NativeSelectOption key={item.id} value={item.id}>
              {item.index}. {item.sourceName} · 第 {item.part} 段
              {item.status ? ` · ${LABELS[item.status] || item.status}` : ''}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <nav aria-label="分段列表" className="hidden flex-col gap-1 md:flex">
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
            <span className="mt-0.5 w-5 shrink-0 text-caption tabular-nums">{item.index}</span>
            <span className="min-w-0">
              <span className="block truncate text-body font-medium">{item.sourceName}</span>
              <span className="mt-1 block text-caption">
                第 {item.part} 段{item.status ? ` · ${LABELS[item.status] || item.status}` : ''}
              </span>
            </span>
          </button>
        ))}
      </nav>
    </>
  )
}
