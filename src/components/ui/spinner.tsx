import * as React from 'react'
import { LoaderCircleIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Decorative by default; pair it with visible text or pass `aria-label` + `role="status"`. */
function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  return <LoaderCircleIcon aria-hidden="true" className={cn('size-4 animate-spin', className)} {...props} />
}

export { Spinner }
