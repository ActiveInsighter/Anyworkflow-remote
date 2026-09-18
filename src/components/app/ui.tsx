import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { AlertCircle, CircleDashed, LoaderCircle } from 'lucide-react'
import type { StatusTone } from '@/types'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
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

export function AppPage({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={cn('mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pb-16 sm:pt-8 lg:px-8 lg:pt-10', className)}>{children}</div>
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{eyebrow}</p> : null}
        <h1 className="text-balance text-2xl font-semibold tracking-[-0.035em] sm:text-3xl lg:text-[34px]">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:shrink-0 sm:justify-end">{actions}</div> : null}
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
    <div className="mb-3 mt-8 flex items-end justify-between gap-4">
      <div>
        {eyebrow ? <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{eyebrow}</p> : null}
        <h2 className="text-lg font-semibold tracking-[-0.02em]">{title}</h2>
      </div>
      {trailing ? <div className="text-xs text-muted-foreground">{trailing}</div> : null}
    </div>
  )
}

export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <Badge className={cn('h-6 rounded-full px-2.5 text-[10px] font-semibold', toneClasses[tone])}>{children}</Badge>
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
      aria-label={`进度 ${safeValue}%`}
      className={cn('h-1.5 bg-muted', className)}
      indicatorClassName={progressToneClasses[tone]}
    />
  )
}

export function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <Alert variant="destructive" className="mb-4">
      <AlertCircle />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  )
}

export function LoadingState({ label = '正在加载…' }: { label?: string }) {
  return (
    <Card className="border-dashed bg-card/70 shadow-none">
      <CardContent className="flex min-h-44 items-center justify-center gap-2.5 p-6 text-sm text-muted-foreground" role="status" aria-live="polite">
        <LoaderCircle className="size-4 animate-spin" />
        <span>{label}</span>
      </CardContent>
    </Card>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <Card className="border-dashed bg-card/70 shadow-none">
      <CardContent className="flex min-h-64 flex-col items-center justify-center p-8 text-center sm:p-12">
        <div className="mb-4 grid size-11 place-items-center rounded-xl bg-muted text-muted-foreground">
          <CircleDashed className="size-5" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description ? <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p> : null}
        {action ? <div className="mt-5">{action}</div> : null}
      </CardContent>
    </Card>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="grid gap-2">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {hint ? <p className="text-[11px] leading-5 text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <Input {...props} className={cn('h-10', props.className)} />
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <Textarea {...props} className={cn(props.className)} />
}

export function MetaGrid({
  items,
}: {
  items: Array<{ label: string; value: ReactNode }>
}) {
  return (
    <dl className="grid grid-cols-2 overflow-hidden rounded-lg border bg-muted/20 sm:grid-cols-4">
      {items.map((item) => (
        <div className="min-w-0 border-b border-r p-3.5 last:border-r-0 sm:p-4 [&:nth-last-child(-n+2)]:border-b-0 sm:[&:nth-last-child(-n+4)]:border-b-0" key={item.label}>
          <dt className="text-[10px] font-medium text-muted-foreground">{item.label}</dt>
          <dd className="mt-1.5 break-words text-xs font-semibold sm:text-sm">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
