import { Check, ChevronDown, CircleAlert, Info, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EditorIssue } from '../lib/editor-helpers'

/** Severity is never communicated by colour alone: each row also carries its text label. */
const SEVERITY = {
  error: { label: '错误', Icon: CircleAlert, tone: 'text-danger' },
  warning: { label: '警告', Icon: TriangleAlert, tone: 'text-warning' },
  info: { label: '提示', Icon: Info, tone: 'text-muted-foreground' },
  hint: { label: '建议', Icon: Info, tone: 'text-muted-foreground' },
} as const

export function countIssues(issues: readonly EditorIssue[]) {
  const errors = issues.filter((issue) => issue.severity === 'error').length
  const warnings = issues.filter((issue) => issue.severity === 'warning').length
  return { errors, warnings, hints: issues.length - errors - warnings }
}

/** Lint results; each row jumps to and selects its range. */
export function EditorIssuesList({
  issues,
  onReveal,
}: {
  issues: readonly EditorIssue[]
  onReveal: (from: number, to: number) => void
}) {
  return (
    <div>
      {issues.length === 0 ? (
        <p className="px-3 py-6 text-center text-caption text-muted-foreground">没有发现问题。</p>
      ) : (
        <ul className="divide-y divide-cm-border">
          {issues.map((issue, index) => {
            const meta = SEVERITY[issue.severity]
            return (
              <li key={`${issue.from}-${issue.line}-${index}`}>
                <button
                  type="button"
                  className="flex w-full items-start gap-2 px-2.5 py-2 text-left outline-none hover:bg-muted/50 focus-visible:bg-muted/50"
                  onClick={() => onReveal(issue.from, issue.to)}
                >
                  <meta.Icon className={cn('mt-0.5 size-3.5 shrink-0', meta.tone)} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-caption font-medium">
                      {meta.label} · 第 {issue.line} 行
                    </span>
                    <span className="mt-0.5 block text-caption leading-5 text-muted-foreground">{issue.message}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function issueSummary(issues: readonly EditorIssue[]): string {
  const { errors, warnings, hints } = countIssues(issues)
  const parts: string[] = []
  if (errors > 0) parts.push(`${errors} 个错误`)
  if (warnings > 0) parts.push(`${warnings} 个警告`)
  if (hints > 0) parts.push(`${hints} 条提示`)
  return parts.length ? parts.join(' · ') : '无问题'
}

/** Status-bar toggle summarising lint results, e.g. "1 个错误 · 2 个警告". */
export function EditorIssuesToggle({
  issues,
  open,
  onOpenChange,
}: {
  issues: readonly EditorIssue[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { errors, warnings } = countIssues(issues)

  return (
    <button
      type="button"
      onClick={() => onOpenChange(!open)}
      aria-expanded={open}
      className={cn(
        'flex min-h-8 items-center gap-1 rounded-sm px-1.5 outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring',
        errors > 0 && 'text-danger',
      )}
    >
      {errors > 0 ? (
        <CircleAlert className="size-3.5" aria-hidden="true" />
      ) : warnings > 0 ? (
        <TriangleAlert className="size-3.5 text-warning" aria-hidden="true" />
      ) : (
        <Check className="size-3.5" aria-hidden="true" />
      )}
      <span>{issueSummary(issues)}</span>
      <ChevronDown
        className={cn('size-3.5 transition-transform duration-fast', open && 'rotate-180')}
        aria-hidden="true"
      />
    </button>
  )
}
