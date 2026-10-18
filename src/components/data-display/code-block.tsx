import type * as React from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/** Read-only monospace surface for DSL sources and raw queue payloads, on editor colours. */
export function CodeBlock({
  children,
  label,
  actions,
  className,
}: {
  children: React.ReactNode
  label?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <Card className={className}>
      {label || actions ? (
        <div className="flex items-center justify-between gap-3 border-b px-4 py-2">
          <div className="text-caption font-medium tracking-label text-muted-foreground uppercase">{label}</div>
          {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
        </div>
      ) : null}
      <pre className="m-0 max-h-[620px] min-h-0 flex-1 overflow-auto bg-cm-bg p-4 font-mono text-xs leading-6 break-words whitespace-pre-wrap text-cm-fg">
        {children}
      </pre>
    </Card>
  )
}
