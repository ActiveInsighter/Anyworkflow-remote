import * as React from 'react'
import { cn } from '@/lib/utils'
import { ChevronDownIcon } from 'lucide-react'

/**
 * Native `<select>` on purpose: it keeps the platform picker on mobile, which is easier to
 * operate than a custom popup. `containerClassName` sizes the wrapper (full width by default).
 */
function NativeSelect({
  className,
  containerClassName,
  size = 'default',
  ...props
}: Omit<React.ComponentProps<'select'>, 'size'> & { size?: 'sm' | 'default'; containerClassName?: string }) {
  return (
    <div
      className={cn('group/native-select relative w-full min-w-0 has-[select:disabled]:opacity-50', containerClassName)}
      data-slot="native-select-wrapper"
    >
      <select
        data-slot="native-select"
        data-size={size}
        className={cn(
          'h-9 w-full min-w-0 appearance-none rounded-lg border border-input bg-card px-3 py-1 pr-9 text-base shadow-xs sm:text-sm transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed data-[size=sm]:h-8 data-[size=sm]:py-1',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 hover:border-border-strong',
          'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
          className,
        )}
        {...props}
      />
      <ChevronDownIcon
        className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground opacity-50 select-none"
        aria-hidden="true"
        data-slot="native-select-icon"
      />
    </div>
  )
}

function NativeSelectOption({ className, ...props }: React.ComponentProps<'option'>) {
  return (
    <option data-slot="native-select-option" className={cn('bg-[Canvas] text-[CanvasText]', className)} {...props} />
  )
}

function NativeSelectOptGroup({ className, ...props }: React.ComponentProps<'optgroup'>) {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      className={cn('bg-[Canvas] text-[CanvasText]', className)}
      {...props}
    />
  )
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption }
