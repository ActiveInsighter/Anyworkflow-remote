import type { LucideIcon } from 'lucide-react'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'

/** A directory entry, shared by settings pages and the editor's configuration dialog. */
export function SettingsRow({
  title,
  description,
  detail,
  icon: Icon,
  to,
  onClick,
  disabled,
}: {
  title: string
  description?: string
  detail?: string
  icon?: LucideIcon
  to?: string
  onClick?: () => void
  disabled?: boolean
}) {
  const content = (
    <>
      {Icon ? (
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col gap-1 text-left">
        <span className="text-sm font-medium">{title}</span>
        {description ? <span className="break-all text-xs text-muted-foreground">{description}</span> : null}
        {detail ? <span className="text-xs text-muted-foreground">{detail}</span> : null}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </>
  )
  const className =
    'flex min-h-touch w-full items-center gap-3 px-4 py-4 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50'
  return to && !disabled ? (
    <Link to={to} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" className={className} onClick={onClick} disabled={disabled}>
      {content}
    </button>
  )
}
