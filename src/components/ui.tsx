import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react'
import type { StatusTone } from '../types'

function classes(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

export function Button({
  variant = 'secondary',
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
}) {
  return (
    <button className={classes('button', `button-${variant}`, className)} {...props}>
      {children}
    </button>
  )
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classes('card', className)} {...props} />
}

export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <span className={classes('status-badge', `status-${tone}`)}>{children}</span>
}

export function ProgressBar({ value, tone = 'info' }: { value: number; tone?: StatusTone }) {
  return (
    <div className="progress-track" aria-label={`进度 ${value}%`}>
      <div className={classes('progress-fill', `progress-${tone}`)} style={{ width: `${value}%` }} />
    </div>
  )
}

export function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div className="error-banner" role="alert">
      <span className="error-dot" />
      <span>{children}</span>
    </div>
  )
}

export function LoadingState({ label = '正在加载…' }: { label?: string }) {
  return (
    <div className="loading-state">
      <span className="spinner" />
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
    <Card className="empty-state">
      <div className="empty-symbol">⌁</div>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </Card>
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
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={classes('text-input', props.className)} {...props} />
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={classes('text-area', props.className)} {...props} />
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
