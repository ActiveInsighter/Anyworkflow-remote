import type * as React from 'react'
import { Folder, MoreVertical } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { DriveEntry, DriveTone, DriveViewMode } from './drive-types'

const TILE: Record<DriveTone, string> = {
  folder: 'text-foreground/70',
  neutral: 'bg-muted text-muted-foreground',
  primary: 'bg-primary-soft text-primary',
  danger: 'bg-danger-soft text-danger',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  info: 'bg-info-soft text-info',
}

/** The entry's glyph: a solid folder, or the item icon on a tinted tile. */
export function DriveEntryIcon({ entry, size = 'md' }: { entry: Pick<DriveEntry, 'kind' | 'icon' | 'tone'>; size?: 'md' | 'lg' | 'xl' }) {
  if (entry.kind === 'folder') {
    return (
      <span className={cn('grid shrink-0 place-items-center', TILE.folder, size === 'md' ? 'size-10' : size === 'lg' ? 'size-12' : 'size-16')}>
        <Folder className={cn('fill-current', size === 'md' ? 'size-7' : size === 'lg' ? 'size-9' : 'size-14')} strokeWidth={1.25} aria-hidden="true" />
      </span>
    )
  }
  const Icon = entry.icon ?? Folder
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center',
        TILE[entry.tone ?? 'neutral'],
        size === 'md' ? 'size-10 rounded-lg' : size === 'lg' ? 'size-12 rounded-xl' : 'size-16 rounded-2xl',
      )}
    >
      <Icon className={size === 'md' ? 'size-5' : size === 'lg' ? 'size-6' : 'size-8'} aria-hidden="true" />
    </span>
  )
}

/* The name is the entry's one interactive target; its ::after stretches over the whole row. */
const TARGET =
  'min-w-0 truncate rounded-[inherit] text-left outline-none after:absolute after:inset-0 after:rounded-[inherit] focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50'

function EntryTarget({ entry, onOpenFolder, className }: { entry: DriveEntry; onOpenFolder: (id: string) => void; className?: string }) {
  const classes = cn(TARGET, className)
  if (entry.kind === 'folder') {
    return (
      <button type="button" className={classes} onClick={() => onOpenFolder(entry.id)} title={entry.name}>
        {entry.name}
      </button>
    )
  }
  if (entry.href && entry.external) {
    return (
      <a href={entry.href} target="_blank" rel="noopener noreferrer" className={classes} title={entry.name}>
        {entry.name}
      </a>
    )
  }
  if (entry.href) {
    return (
      <Link to={entry.href} className={classes} title={entry.name}>
        {entry.name}
      </Link>
    )
  }
  return <span className={classes} title={entry.name}>{entry.name}</span>
}

function MoreButton({ entry, onMore, className }: { entry: DriveEntry; onMore: (entry: DriveEntry) => void; className?: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-touch"
      className={cn('relative z-raised shrink-0 rounded-full text-muted-foreground hover:text-foreground', className)}
      aria-label={`更多操作：${entry.name}`}
      onClick={() => onMore(entry)}
    >
      <MoreVertical />
    </Button>
  )
}

function ListRow({ entry, onOpenFolder, onMore }: RowProps) {
  return (
    <li
      className="group relative flex min-h-16 items-center gap-3 rounded-xl bg-subtle py-2 ps-3 pe-1.5 transition-colors duration-fast hover:bg-muted/70 sm:ps-4"
      onContextMenu={(event) => {
        event.preventDefault()
        onMore(entry)
      }}
    >
      <DriveEntryIcon entry={entry} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <EntryTarget entry={entry} onOpenFolder={onOpenFolder} className="text-body font-medium text-foreground" />
          {entry.badge ? <span className="relative z-raised shrink-0">{entry.badge}</span> : null}
        </div>
        {entry.meta ? <div className="truncate text-caption text-muted-foreground">{entry.meta}</div> : null}
      </div>
      <MoreButton entry={entry} onMore={onMore} />
    </li>
  )
}

function GridCard({ entry, onOpenFolder, onMore }: RowProps) {
  const folder = entry.kind === 'folder'
  return (
    <li
      className="group relative flex min-w-0 flex-col rounded-2xl bg-subtle p-1.5 transition-colors duration-fast hover:bg-muted/70"
      onContextMenu={(event) => {
        event.preventDefault()
        onMore(entry)
      }}
    >
      <div className="flex min-w-0 items-center gap-2 ps-2">
        {folder ? <Folder className="size-4 shrink-0 fill-current text-foreground/70" strokeWidth={1.5} aria-hidden="true" /> : null}
        <EntryTarget entry={entry} onOpenFolder={onOpenFolder} className="flex-1 text-sm font-medium text-foreground" />
        <MoreButton entry={entry} onMore={onMore} className="sm:size-8" />
      </div>
      {folder ? null : (
        <div className="mt-0.5 grid aspect-[4/3] place-items-center rounded-xl bg-background/80">
          <DriveEntryIcon entry={entry} size="xl" />
        </div>
      )}
      {!folder && (entry.badge || entry.meta) ? (
        <div className="flex min-w-0 items-center gap-1.5 px-2 pt-2 pb-1 text-micro text-muted-foreground">
          {entry.badge ? <span className="relative z-raised shrink-0">{entry.badge}</span> : null}
          <span className="truncate">{entry.meta}</span>
        </div>
      ) : null}
    </li>
  )
}

type RowProps = { entry: DriveEntry; onOpenFolder: (id: string) => void; onMore: (entry: DriveEntry) => void }

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section aria-label={label} className="flex flex-col gap-2">
      <h2 className="px-1 text-caption font-medium text-muted-foreground">{label}</h2>
      {children}
    </section>
  )
}

/**
 * Folders, then items, as a list of rows or a grid of cards. Opening a folder stays in the
 * browser; opening an item follows its link. The trailing button (or a right click) asks for
 * the entry's actions.
 */
export function DriveView({
  entries,
  view,
  itemLabel,
  onOpenFolder,
  onMore,
}: {
  entries: readonly DriveEntry[]
  view: DriveViewMode
  /** Heading of the item section, e.g. 文件 or 模板. */
  itemLabel: string
  onOpenFolder: (id: string) => void
  onMore: (entry: DriveEntry) => void
}) {
  const folders = entries.filter((entry) => entry.kind === 'folder')
  const items = entries.filter((entry) => entry.kind === 'item')
  const Row = view === 'grid' ? GridCard : ListRow
  const listClass =
    view === 'grid'
      ? 'grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 2xl:grid-cols-5'
      : 'flex flex-col gap-1.5'
  return (
    <div className="flex flex-col gap-6">
      {folders.length ? (
        <Section label="文件夹">
          <ul className={listClass}>
            {folders.map((entry) => (
              <Row key={entry.id} entry={entry} onOpenFolder={onOpenFolder} onMore={onMore} />
            ))}
          </ul>
        </Section>
      ) : null}
      {items.length ? (
        <Section label={itemLabel}>
          <ul className={listClass}>
            {items.map((entry) => (
              <Row key={entry.id} entry={entry} onOpenFolder={onOpenFolder} onMore={onMore} />
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  )
}
