import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

/** Reserved-height placeholder for an asynchronous region, announced politely to screen readers. */
export function LoadingState({ label = '加载中…', className }: { label?: string; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex min-h-32 items-center justify-center gap-2 rounded-lg border bg-muted/30 text-sm text-muted-foreground',
        className,
      )}
    >
      <Spinner />
      <span>{label}</span>
    </div>
  )
}
