import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const alertVariants = cva(
  'relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-2.5 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current',
  {
    variants: {
      variant: {
        default: 'bg-card text-card-foreground',
        info: 'border-info/25 bg-info-soft text-info',
        warning: 'border-warning/30 bg-warning-soft text-warning',
        destructive: 'border-danger/25 bg-danger-soft text-danger',
      },
      size: {
        default: 'px-4 py-3 text-sm',
        /** Inline notes inside panels, rows and dialogs. */
        sm: 'px-3 py-2 text-xs leading-5 has-[>svg]:grid-cols-[calc(var(--spacing)*3.5)_1fr] has-[>svg]:gap-x-2 [&>svg]:size-3.5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Alert({
  className,
  variant,
  size,
  role,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role={role ?? (variant === 'destructive' ? 'alert' : 'status')}
      className={cn(alertVariants({ variant, size }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-title"
      className={cn('col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight', className)}
      {...props}
    />
  )
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn('col-start-2 grid min-w-0 justify-items-start gap-1 break-words [&_p]:leading-relaxed', className)}
      {...props}
    />
  )
}

/** Trailing actions aligned under the description, e.g. "Restore" / "Discard". */
function AlertActions({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="alert-actions" className={cn('col-start-2 mt-1.5 flex flex-wrap gap-1.5', className)} {...props} />
}

export { Alert, AlertActions, AlertDescription, AlertTitle }
