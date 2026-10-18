import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

/**
 * Single-choice segmented control (2–5 options) on the shadcn ToggleGroup. Items expose the
 * radio role; a selection can never be cleared by clicking the active option again.
 */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  label,
  className,
}: {
  value: T
  onValueChange: (value: T) => void
  options: ReadonlyArray<SegmentedOption<T>>
  label: string
  className?: string
}) {
  return (
    <ToggleGroup
      type="single"
      variant="segmented"
      spacing={1}
      aria-label={label}
      value={value}
      onValueChange={(next) => {
        if (next) onValueChange(next as T)
      }}
      className={cn('h-9 w-full', className)}
    >
      {options.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value}>
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
