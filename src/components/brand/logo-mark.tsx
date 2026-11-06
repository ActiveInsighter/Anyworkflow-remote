import { cn } from '@/lib/utils'

/** The mark: three staggered bars, steps handing off to one another. Keep in step with public/favicon.svg. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn('size-8 shrink-0 text-primary', className)}>
      <rect width="32" height="32" rx="9" fill="currentColor" />
      <g className="fill-primary-foreground">
        <rect x="7" y="8.6" width="12" height="3.8" rx="1.9" />
        <rect x="12" y="14.1" width="13" height="3.8" rx="1.9" opacity="0.72" />
        <rect x="7" y="19.6" width="9" height="3.8" rx="1.9" />
      </g>
    </svg>
  )
}
