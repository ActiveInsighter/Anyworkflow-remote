import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { AlertCircle, CircleDashed, LoaderCircle } from 'lucide-react'
import type { StatusTone } from '@/types'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

const toneClasses: Record<StatusTone, string> = {
  neutral: 'border-transparent bg-muted text-muted-foreground',
  info: 'border-transparent bg-[var(--info-soft)] text-[var(--info)]',
  success: 'border-transparent bg-[var(--success-soft)] text-[var(--success)]',
  danger: 'border-transparent bg-[var(--danger-soft)] text-[var(--danger)]',
  warning: 'border-transparent bg-[var(--warning-soft)] text-[var(--warning)]',
}

const progressToneClasses: Record<StatusTone, string> = {
  neutral: 'bg-muted-foreground',
  info: 'bg-[var(--info)]',
  success: 'bg-[var(--success)]',
  danger: 'bg-[var(--danger)]',
  warning: 'bg-[var(--warning)]',
}

export function AppPage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn(
      'mx-auto w-full max-w-[1220px] px-4 pb-10 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pb-14',
      className,
    )}>
      {children}
    </div>
  )
}

export function PageHeader({
  eyebrow,
  title,
  actions,
}: {
  eyebrow?: string
  title: string
  actions?: ReactNode
}) {
  return (
    <header className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-[11px] font-medium text-muted-foreground">{eyebrow}</div> : null}
        <h1 className="truncate text-[24px] font-semibold tracking-[-0.035em] sm:text-[26px]">{title}</h1>
      </div>
      {actions ? <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">{actions}</div> : null}
    </header>
  )
}

export function SectionHeading({
  eyebrow,
  title,
  trailing,
}: {
  eyebrow?: string
  title: string
  trailing?: ReactNode
}) {
  return (
    <div className="mb-2 mt-6 flex items-center justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-0.5 text-[10px] font-medium text-muted-foreground">{eyebrow}</div> : null}
        <h2 className="truncate text-sm font-semibold tracking-[-0.015em]">{title}</h2>
      </div>
      {trailing ? <div className="shrink-0 text-xs tabular-nums text-muted-foreground">{trailing}</div> : null}
    </div>
  )
}

export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <Badge className={cn('h-6 rounded-md px-2 text-[10px] font-medium', toneClasses[tone])}>{children}</Badge>
}

export function ProgressBar({
  value,
  tone = 'info',
  className,
}: {
  value: number
  tone?: StatusTone
  className?: string
}) {
  const safeValue = Math.max(0, Math.min(100, value))
  return (
    <Progress
      value={safeValue}
      aria-label={'进度 ' + safeValue + '%'}
      className={cn('h-1 bg-muted', className)}
      indicatorClassName={progressToneClasses[tone]}
    />
  )
}

export function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <Alert variant="destructive" className="mb-4 rounded-lg">
      <AlertCircle />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  )
}

export function LoadingState({ label = '加载中…' }: { label?: string }) {
  return (
    <div className="flex min-h-32 items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground" role="status" aria-live="polite">
      <LoaderCircle className="size-4 animate-spin" />
      <span>{label}</span>
    </div>
  )
}

export function EmptyState({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center">
      <CircleDashed className="mb-3 size-5 text-muted-foreground" />
      <div className="text-sm font-medium">{title}</div>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <Input {...props} className={cn('h-9', props.className)} />
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <Textarea {...props} className={cn(props.className)} />
}

export function MetaGrid({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="grid grid-cols-2 gap-x-5 gap-y-4 border-y py-4 sm:grid-cols-4 sm:gap-x-7">
      {items.map((item) => (
        <div className="min-w-0" key={item.label}>
          <dt className="text-[10px] font-medium text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 truncate text-xs font-medium sm:text-sm">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
