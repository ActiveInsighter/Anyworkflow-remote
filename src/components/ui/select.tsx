import * as React from 'react'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { Select as Primitive } from '@animate-ui/react/primitives/radix-ui'
import { cn } from '@/lib/utils'

// Prefix every value so the empty/default option remains a real selectable item.
const encode = (value: string | number) => `value:${value}`

type SelectFieldProps = Omit<React.ComponentProps<typeof Primitive.Trigger>, 'value' | 'defaultValue' | 'onChange'> & {
  value?: string | number
  defaultValue?: string | number
  onValueChange?: (value: string) => void
  name?: string
  required?: boolean
  form?: string
  size?: 'sm' | 'default'
  containerClassName?: string
}

/** Animate UI select, shared by all forms on desktop and touch devices. */
export function SelectField({ value, defaultValue = '', onValueChange, name, required, form, size = 'default',
  containerClassName, className, children, disabled, ...props }: SelectFieldProps) {
  return (
    <Primitive.Root value={value === undefined ? undefined : encode(value)} defaultValue={encode(defaultValue)}
      onValueChange={(next) => onValueChange?.(next.slice(6))} disabled={disabled} name={name} required={required}>
      <div className={cn('min-w-0 w-full', containerClassName)}>
        <Primitive.Trigger data-slot="select-trigger" data-size={size} data-value={value} disabled={disabled} form={form}
          className={cn('flex h-touch w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-card px-3 text-start text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive sm:h-9 sm:text-sm data-[size=sm]:h-8 [&>span:first-child]:min-w-0 [&>span:first-child]:truncate', className)} {...props}>
          <Primitive.Value />
          <Primitive.Icon asChild><ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /></Primitive.Icon>
        </Primitive.Trigger>
      </div>
      <Primitive.Portal>
        <Primitive.Content position="popper" sideOffset={6} align="start" data-slot="select-content"
          className="z-overlay max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg">
          <Primitive.ScrollUpButton className="flex justify-center py-1"><ChevronUp className="size-4" /></Primitive.ScrollUpButton>
          <Primitive.Viewport className="max-h-80 scroll-py-1">{children}</Primitive.Viewport>
          <Primitive.ScrollDownButton className="flex justify-center py-1"><ChevronDown className="size-4" /></Primitive.ScrollDownButton>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  )
}

export function SelectOption({ value, children, className, ...props }:
  Omit<React.ComponentProps<typeof Primitive.Item>, 'value'> & { value: string | number }) {
  return <Primitive.Item value={encode(value)} data-slot="select-item" data-value={String(value)}
    className={cn('relative flex min-h-touch min-w-0 cursor-default select-none items-center rounded-lg py-2 ps-3 pe-9 text-body outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 sm:min-h-9', className)} {...props}>
    <Primitive.ItemText><span className="break-words">{children}</span></Primitive.ItemText>
    <span className="absolute end-3 flex size-4 items-center justify-center"><Primitive.ItemIndicator><Check className="size-4" /></Primitive.ItemIndicator></span>
  </Primitive.Item>
}

export function SelectGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return <Primitive.Group><Primitive.Label className="px-3 py-2 text-caption text-muted-foreground">{label}</Primitive.Label>{children}</Primitive.Group>
}
