import { CheckCircle2, CircleAlert, CircleDot, CircleMinus, Clock3 } from 'lucide-react'
import { SelectField, SelectOption } from '@/components/ui/select'
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
  if (status === 'succeeded') return <CheckCircle2 className="size-3.5 shrink-0 text-success" aria-hidden="true" />
  if (status === 'failed') return <CircleAlert className="size-3.5 shrink-0 text-danger" aria-hidden="true" />
  if (status === 'running') return <CircleDot className="size-3.5 shrink-0 text-info" aria-hidden="true" />
  if (status === 'queued') return <Clock3 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
  if (status === 'canceled') return <CircleMinus className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
  return null
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
                'flex min-h-touch min-w-0 items-start gap-2.5 rounded-xl px-3 py-2.5 text-start outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'bg-card text-foreground shadow-xs ring-1 ring-border'
                  : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
              )}
            >
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-muted/80 text-micro font-medium tabular-nums text-muted-foreground">
                {item.index}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate text-body', active ? 'font-semibold text-foreground' : 'font-medium')}>
                  {item.sourceName}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-caption text-muted-foreground">
                  <SegmentStatusIcon status={item.status} />
                  <span>第 {item.part} 段{item.status ? ` · ${LABELS[item.status] || item.status}` : ''}</span>
                </span>
              </span>
            </button>
          )
        })}
      </nav>
    </>
  )
}
