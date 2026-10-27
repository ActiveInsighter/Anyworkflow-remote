import { Fragment, useState } from 'react'
import type * as React from 'react'
import { Link } from 'react-router'
import { Separator } from '@/components/ui/separator'
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalHeader,
  ModalTitle,
  ModalTrigger,
  useModal,
} from '@/components/ui/modal'
import { cn } from '@/lib/utils'
import type { DriveAction, DriveEntry } from './drive-types'
import { DriveEntryIcon } from './drive-view'

const ROW =
  'flex min-h-13 w-full items-center gap-4 rounded-xl px-3 text-start text-body text-foreground outline-none transition-colors duration-fast hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground'
const DANGER = 'text-danger [&_svg]:text-danger'

/** Header shared by the sheet and its pages: the entry's glyph, name and one line of context. */
export function DriveSheetTitle({ entry, description }: { entry: Pick<DriveEntry, 'kind' | 'icon' | 'tone' | 'name'>; description?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <DriveEntryIcon entry={entry} />
      <div className="min-w-0 flex-1">
        <ModalTitle className="truncate">{entry.name}</ModalTitle>
        {description ? <ModalDescription className="truncate text-caption text-muted-foreground">{description}</ModalDescription> : null}
      </div>
    </div>
  )
}

function PageBody({ render }: { render: (close: () => void) => React.ReactNode }) {
  const modal = useModal()
  return <>{render(() => modal?.closeAll())}</>
}

function ActionRow({ action }: { action: DriveAction }) {
  const modal = useModal()
  const close = (returnFocus = true) => modal?.closeAll({ returnFocus })
  const content = (
    <>
      <action.icon aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{action.label}</span>
    </>
  )
  if (action.kind === 'link') {
    if (action.external || action.download) {
      return (
        <a
          className={ROW}
          href={action.href}
          target={action.download ? undefined : '_blank'}
          rel="noopener noreferrer"
          download={action.download}
          onClick={() => close()}
        >
          {content}
        </a>
      )
    }
    return (
      <Link className={ROW} to={action.href} onClick={() => close(false)}>
        {content}
      </Link>
    )
  }
  if (action.kind === 'page') {
    return (
      <Modal>
        <ModalTrigger
          disabled={action.disabled}
          render={<button type="button" className={cn(ROW, action.destructive && DANGER)} />}
        >
          {content}
        </ModalTrigger>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>{action.title}</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <PageBody render={action.render} />
          </ModalBody>
        </ModalContent>
      </Modal>
    )
  }
  return (
    <button
      type="button"
      className={cn(ROW, action.destructive && DANGER)}
      disabled={action.disabled}
      onClick={() => {
        close()
        action.onSelect()
      }}
    >
      {content}
    </button>
  )
}

/**
 * The actions of one entry in a sheet (bottom sheet on phones, floating on wide screens).
 * Actions that need input open as a page inside the same sheet. Keeps showing the last entry
 * while it animates closed.
 */
export function DriveActionSheet({
  entry,
  description,
  groups,
  onClose,
}: {
  entry: DriveEntry | null
  description?: React.ReactNode
  groups: DriveAction[][]
  onClose: () => void
}) {
  const [shown, setShown] = useState<{ entry: DriveEntry; description?: React.ReactNode; groups: DriveAction[][] } | null>(null)
  if (entry && (shown?.entry !== entry || shown.groups !== groups || shown.description !== description)) {
    setShown({ entry, description, groups })
  }
  return (
    <Modal
      open={Boolean(entry)}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <ModalContent size="sm">
        {shown ? (
          <>
            <ModalHeader>
              <DriveSheetTitle entry={shown.entry} description={shown.description} />
            </ModalHeader>
            <ModalBody className="flex flex-col gap-1 px-2! pb-[calc(1rem+env(safe-area-inset-bottom))]!">
              {shown.groups.filter((group) => group.length).map((group, index) => (
                <Fragment key={group[0]?.id ?? index}>
                  {index > 0 ? <Separator className="my-1 ms-13 w-auto!" /> : null}
                  <div role="group" className="flex flex-col">
                    {group.map((action) => (
                      <ActionRow key={action.id} action={action} />
                    ))}
                  </div>
                </Fragment>
              ))}
            </ModalBody>
          </>
        ) : null}
      </ModalContent>
    </Modal>
  )
}
