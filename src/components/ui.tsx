import type { ComponentProps, HTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { AlertCircle, CircleDashed, LoaderCircle } from 'lucide-react'
import type { StatusTone } from '../types'
import { Alert, AlertDescription } from './ui/alert'
import { Badge } from './ui/badge'
import { Button as ShadcnButton } from './ui/button'
import { Card as ShadcnCard } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Progress } from './ui/progress'
import { Textarea } from './ui/textarea'
import { cn } from '../lib/utils'

type LegacyButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type AppButtonProps = Omit<ComponentProps<typeof ShadcnButton>, 'variant'> & {
  variant?: LegacyButtonVariant
}

const buttonVariantMap: Record<LegacyButtonVariant, ComponentProps<typeof ShadcnButton>['variant']> = {
  primary: 'default',
  secondary: 'outline',
  ghost: 'ghost',
  danger: 'destructive',
}

export function Button({ variant = 'secondary', ...props }: AppButtonProps) {
  return <ShadcnButton variant={buttonVariantMap[variant]} {...props} />
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <ShadcnCard className={cn('shadow-sm', className)} {...props} />
}

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

export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <Badge className={cn('min-h-6 rounded-full px-2.5 text-[10px] font-semibold', toneClasses[tone])}>{children}</Badge>
}

export function ProgressBar({ value, tone = 'info' }: { value: number; tone?: StatusTone }) {
  return (
    <Progress
      value={Math.max(0, Math.min(100, value))}
      aria-label={`进度 ${value}%`}
      className="mt-[18px] h-[5px] bg-muted"
      indicatorClassName={progressToneClasses[tone]}
    />
  )
}

export function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <Alert variant="destructive" className="mb-[18px]">
      <AlertCircle />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  )
}

export function LoadingState({ label = '正在加载…' }: { label?: string }) {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <LoaderCircle className="size-4 animate-spin" />
      <span>{label}</span>
    </div>
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
    <ShadcnCard className="empty-state">
      <div className="empty-symbol"><CircleDashed className="size-5" /></div>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </ShadcnCard>
  )
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
    <header className="page-header">
      <div>
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
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
    <label className="field">
      <Label asChild><span>{label}</span></Label>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <Input {...props} className={cn('h-11', props.className)} />
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
    <div className="meta-grid">
      {items.map((item) => (
        <div className="meta-item" key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  )
}
