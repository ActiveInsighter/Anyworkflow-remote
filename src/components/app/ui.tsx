import type { InputHTMLAttributes, ReactElement, ReactNode, TextareaHTMLAttributes } from 'react'
import * as React from 'react'
import { AlertCircle, CircleDashed, LoaderCircle, TriangleAlert } from 'lucide-react'
import type { StatusTone } from '@/types'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, type SelectProps } from '@/components/ui/select'
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

/* ------------------------------------------------------------------ layout */

export function AppPage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'mx-auto w-full max-w-[1180px] px-4 pb-12 pt-4 sm:px-6 sm:pb-16 sm:pt-7 lg:px-10 lg:pt-9',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header
      className={cn(
        'mb-5 flex flex-col gap-3 sm:mb-7 sm:flex-row sm:items-start sm:justify-between sm:gap-6',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-1.5 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">{eyebrow}</div>
        ) : null}
        <h1 className="truncate text-[21px] font-semibold tracking-[-0.03em] sm:text-[24px]">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-[13px] leading-5 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end sm:pt-0.5">
          {actions}
        </div>
      ) : null}
    </header>
  )
}

export function SectionHeading({
  title,
  description,
  trailing,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  trailing?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-2.5 mt-7 flex items-end justify-between gap-4 first:mt-0', className)}>
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold tracking-[-0.01em]">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {trailing ? (
        <div className="shrink-0 text-xs tabular-nums text-muted-foreground">{trailing}</div>
      ) : null}
    </div>
  )
}

/** Standard bordered surface used by every card, panel and list on the pages. */
export function Panel({
  className,
  children,
  ...props
}: React.ComponentProps<'section'>) {
  return (
    <section
      className={cn('overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-xs', className)}
      {...props}
    >
      {children}
    </section>
  )
}

export function PanelHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3', className)}>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold">{title}</div>
        {description ? <div className="mt-0.5 text-xs text-muted-foreground">{description}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div> : null}
    </div>
  )
}

/** Rows inside a Panel. `render` swaps the element so link rows keep real navigation. */
export function ListRow({
  className,
  children,
  render,
  ...props
}: Omit<React.ComponentProps<'div'>, 'children'> & {
  children: ReactNode
  render?: ReactElement
}) {
  const rowClassName = cn(
    'border-b border-border p-4 last:border-b-0 transition-colors hover:bg-muted/40',
    className,
  )

  if (render) {
    return React.cloneElement(
      render as ReactElement<Record<string, unknown>>,
      { className: cn((render.props as { className?: string }).className, rowClassName) },
      children,
    )
  }

  return (
    <div className={rowClassName} {...props}>
      {children}
    </div>
  )
}

export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-center', className)}>{children}</div>
}

/** Two-or-more-way toggle styled like the tab list, for inline form choices. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T
  onChange: (value: T) => void
  options: ReadonlyArray<{ value: T; label: string }>
  label: string
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('grid h-9 gap-1 rounded-md bg-muted p-1', className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={cn(
              'rounded-[6px] text-xs font-medium text-muted-foreground outline-none transition-colors',
              'focus-visible:ring-2 focus-visible:ring-ring/35',
              selected && 'bg-background text-foreground shadow-xs',
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ status */

export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <Badge
      variant="plain"
      className={cn('h-[22px] shrink-0 rounded-md px-2 text-[11px] font-medium', toneClasses[tone])}
    >
      {children}
    </Badge>
  )
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
      className={cn('h-1.5 bg-muted', className)}
      indicatorClassName={progressToneClasses[tone]}
    />
  )
}

export function MetaGrid({
  items,
  columns = 4,
}: {
  items: Array<{ label: ReactNode; value: ReactNode }>
  columns?: 2 | 3 | 4
}) {
  return (
    <dl
      className={cn(
        'grid grid-cols-2 gap-x-5 gap-y-4 border-y border-border py-4',
        columns === 3 && 'sm:grid-cols-3',
        columns === 4 && 'sm:grid-cols-4',
        'sm:gap-x-7',
      )}
    >
      {items.map((item, index) => (
        <div className="min-w-0" key={index}>
          <dt className="text-[11px] font-medium text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 truncate text-[13px] font-medium">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Inline note for a failure that belongs to the surrounding panel rather than the page. */
export function InlineError({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-[var(--danger)]/25 bg-[var(--danger-soft)] px-3 py-2 text-xs leading-5 text-[var(--danger)]">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">{children}</span>
    </div>
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
    <div
      className="flex min-h-32 items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong text-sm text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex min-h-40 flex-col items-center justify-center rounded-lg border border-dashed border-border-strong px-6 py-10 text-center',
        className,
      )}
    >
      <CircleDashed className="mb-3 size-5 text-muted-foreground" aria-hidden="true" />
      <div className="text-[13px] font-medium">{title}</div>
      {description ? <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

/* ------------------------------------------------------------------ forms */

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: ReactNode
  hint?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
      {children}
      {hint ? <p className="text-[11px] leading-4 text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <Input {...props} className={cn('h-9', props.className)} />
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <Textarea {...props} className={cn(props.className)} />
}

export function SelectInput({ className, containerClassName, ...props }: SelectProps) {
  return <Select className={cn('h-9', className)} containerClassName={cn('w-full', containerClassName)} {...props} />
}

/** Monospace surface used for DSL sources and raw queue payloads. */
export function CodeBlock({
  children,
  className,
  label,
  actions,
}: {
  children: ReactNode
  className?: string
  label?: ReactNode
  actions?: ReactNode
}) {
  return (
    <Panel className={cn('flex flex-col', className)}>
      {label || actions ? (
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">{label}</div>
          {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
        </div>
      ) : null}
      <pre className="m-0 max-h-[620px] min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words bg-[var(--cm-bg)] p-4 font-mono text-xs leading-6 text-[var(--cm-fg)]">
        {children}
      </pre>
    </Panel>
  )
}
