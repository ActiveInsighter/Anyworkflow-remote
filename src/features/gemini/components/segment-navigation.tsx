import { CircleCheck, CircleMinus, CircleX, Clock3 } from 'lucide-react'
import { SelectField, SelectOption } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
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

function SegmentStatusIcon({ status }: { status?: string }) {
  if (!status) return null
  if (status === 'running') return <Spinner className="size-3.5 shrink-0 text-primary" />
  if (status === 'succeeded') return <CircleCheck aria-hidden="true" className="size-3.5 shrink-0 text-success" />
  if (status === 'failed') return <CircleX aria-hidden="true" className="size-3.5 shrink-0 text-danger" />
  if (status === 'canceled') return <CircleMinus aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
  return <Clock3 aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
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
        <SelectField aria-label="选择分段" value={value} onValueChange={(value) => onChange(value)}>
          {items.map((item) => (
            <SelectOption key={item.id} value={item.id}>
              {item.index}. {item.sourceName} · 第 {item.part} 段
              {item.status ? ` · ${LABELS[item.status] || item.status}` : ''}
            </SelectOption>
          ))}
        </SelectField>
      </div>
      <nav aria-label="分段列表" className="hidden flex-col gap-1.5 md:flex">
        {items.map((item) => {
          const active = item.id === value
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? 'true' : undefined}
              onClick={() => onChange(item.id)}
              className={cn(
                'group flex min-h-touch min-w-0 items-start gap-2.5 rounded-xl px-3 py-2.5 text-start outline-none transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'bg-card text-foreground shadow-xs ring-1 ring-border'
                  : 'text-muted-foreground hover:bg-card/60 hover:text-foreground',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md text-micro font-semibold tabular-nums',
                  active ? 'bg-primary-soft text-primary' : 'bg-muted text-muted-foreground group-hover:text-foreground',
                )}
              >
                {item.index}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-medium leading-snug">{item.sourceName}</span>
                <span className="mt-1 flex items-center gap-1.5 text-caption text-muted-foreground">
                  <SegmentStatusIcon status={item.status} />
                  <span className="truncate">
                    第 {item.part} 段{item.status ? ` · ${LABELS[item.status] || item.status}` : ''}
                  </span>
                </span>
              </span>
            </button>
          )
        })}
      </nav>
    </>
  )
}
