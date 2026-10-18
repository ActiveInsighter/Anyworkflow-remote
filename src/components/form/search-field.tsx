import { Search, X } from 'lucide-react'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { cn } from '@/lib/utils'

/** Search input with a leading icon and a clear button once there is text. */
export function SearchField({
  value,
  onValueChange,
  label,
  placeholder,
  clearLabel = '清除搜索',
  size = 'default',
  className,
}: {
  value: string
  onValueChange: (value: string) => void
  /** Accessible name; also used as the placeholder when none is given. */
  label: string
  placeholder?: string
  clearLabel?: string
  /** `touch` grows to 44px on mobile for primary search fields. */
  size?: 'default' | 'touch'
  className?: string
}) {
  return (
    <InputGroup className={cn('bg-card', size === 'touch' && 'h-touch sm:h-9', className)}>
      <InputGroupAddon>
        <Search aria-hidden="true" />
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        aria-label={label}
        placeholder={placeholder ?? label}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        className="[&::-webkit-search-cancel-button]:appearance-none"
      />
      {value ? (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label={clearLabel} onClick={() => onValueChange('')}>
            <X />
          </InputGroupButton>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  )
}
