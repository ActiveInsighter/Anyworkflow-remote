import { useState } from 'react'
import type * as React from 'react'
import { ArrowLeft, ChevronRight, Folder, FolderInput, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Modal, ModalBody, ModalContent, ModalHeader, ModalTitle, useModal } from '@/components/ui/modal'
import { toErrorMessage } from '@/lib/api/errors'
import { drivePath, driveChildren } from './drive-sort'
import type { DriveFolder } from './drive-types'

const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' })

/** A single name field (rename, new folder). Selects the name without its extension. */
export function DriveNameForm({
  initial = '',
  label,
  submitLabel,
  maxLength = 120,
  keepExtension = false,
  onSubmit,
  onDone,
}: {
  initial?: string
  label: string
  submitLabel: string
  maxLength?: number
  /** Select only the part before the last dot when the field focuses. */
  keepExtension?: boolean
  onSubmit: (name: string) => Promise<unknown>
  onDone: () => void
}) {
  const [name, setName] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const unchanged = name.trim() === initial.trim()

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={async (event) => {
        event.preventDefault()
        if (!name.trim() || busy) return
        if (unchanged) return onDone()
        setBusy(true)
        setError('')
        try {
          await onSubmit(name.trim())
          onDone()
        } catch (cause) {
          setError(toErrorMessage(cause))
        } finally {
          setBusy(false)
        }
      }}
    >
      <Field data-invalid={Boolean(error) || undefined}>
        <FieldLabel htmlFor="drive-name">{label}</FieldLabel>
        <Input
          id="drive-name"
          autoFocus
          value={name}
          maxLength={maxLength}
          aria-invalid={Boolean(error)}
          className="h-11"
          onChange={(event) => setName(event.target.value)}
          onFocus={(event) => {
            const dot = keepExtension ? event.currentTarget.value.lastIndexOf('.') : -1
            event.currentTarget.setSelectionRange(0, dot > 0 ? dot : event.currentTarget.value.length)
          }}
        />
        {error ? <FieldError>{error}</FieldError> : null}
      </Field>
      <Button type="submit" size="touch" className="w-full sm:h-10" disabled={!name.trim() || busy}>
        {busy ? '正在保存…' : submitLabel}
      </Button>
    </form>
  )
}

/** A name form in its own sheet, for actions started outside an entry (新建文件夹). */
export function DriveNameModal({
  open,
  onOpenChange,
  title,
  ...form
}: Omit<React.ComponentProps<typeof DriveNameForm>, 'onDone'> & {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent size="sm">
        <ModalHeader>
          <ModalTitle>{title}</ModalTitle>
        </ModalHeader>
        <ModalBody>{open ? <DriveNameForm {...form} onDone={() => onOpenChange(false)} /> : null}</ModalBody>
      </ModalContent>
    </Modal>
  )
}

/**
 * Browse the folder tree inside the sheet and move the entry to the folder on screen.
 * Folders that cannot hold the entry (itself and its descendants) are left out.
 */
export function DriveFolderPicker({
  folders,
  current,
  exclude,
  rootLabel,
  onMove,
  onDone,
}: {
  folders: readonly DriveFolder[]
  /** The folder the entry is in now. */
  current: string
  exclude?: (folderId: string) => boolean
  rootLabel: string
  onMove: (folderId: string) => Promise<unknown>
  onDone: () => void
}) {
  const [at, setAt] = useState(current && folders.some((folder) => folder.id === current) ? current : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const path = drivePath(at, folders)
  const here = path.at(-1)
  const children = driveChildren(at, folders)
    .filter((folder) => !exclude?.(folder.id))
    .sort((a, b) => collator.compare(a.name, b.name))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-h-touch items-center gap-2 rounded-xl bg-subtle px-1.5">
        {here ? (
          <Button type="button" variant="ghost" size="icon-touch" className="rounded-full" aria-label="上一级" onClick={() => setAt(here.parent && folders.some((folder) => folder.id === here.parent) ? here.parent : '')}>
            <ArrowLeft />
          </Button>
        ) : (
          <span className="grid size-touch place-items-center text-muted-foreground">
            <Home className="size-4" aria-hidden="true" />
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-body font-medium" aria-live="polite">{here?.name ?? rootLabel}</span>
      </div>

      <ul className="flex max-h-[44dvh] flex-col overflow-y-auto" aria-label="子文件夹">
        {children.map((folder) => (
          <li key={folder.id}>
            <button
              type="button"
              className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-start outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60"
              onClick={() => setAt(folder.id)}
            >
              <Folder className="size-5 shrink-0 fill-current text-foreground/70" strokeWidth={1.5} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-body">{folder.name}</span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          </li>
        ))}
        {children.length === 0 ? <li className="px-3 py-6 text-center text-caption text-muted-foreground">没有子文件夹</li> : null}
      </ul>

      {error ? <p role="alert" className="text-caption text-danger">{error}</p> : null}
      <Button
        type="button"
        size="touch"
        className="w-full sm:h-10"
        disabled={busy || at === current}
        onClick={async () => {
          setBusy(true)
          setError('')
          try {
            await onMove(at)
            onDone()
          } catch (cause) {
            setError(toErrorMessage(cause))
          } finally {
            setBusy(false)
          }
        }}
      >
        <FolderInput data-icon="inline-start" />
        {busy ? '正在移动…' : at === current ? '已在此位置' : `移到「${here?.name ?? rootLabel}」`}
      </Button>
    </div>
  )
}

/** Confirmation inside the sheet. 取消 steps back to the action list. */
export function DriveConfirm({
  message,
  confirmLabel,
  onConfirm,
  onDone,
}: {
  message: React.ReactNode
  confirmLabel: string
  onConfirm: () => Promise<unknown>
  onDone: () => void
}) {
  const modal = useModal()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <div className="flex flex-col gap-5">
      <div className="text-body text-muted-foreground">{message}</div>
      {error ? <p role="alert" className="text-caption text-danger">{error}</p> : null}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" size="touch" className="sm:h-10" disabled={busy} onClick={() => modal?.close()}>
          取消
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="touch"
          className="sm:h-10"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError('')
            try {
              await onConfirm()
              onDone()
            } catch (cause) {
              setError(toErrorMessage(cause))
              setBusy(false)
            }
          }}
        >
          {busy ? '正在处理…' : confirmLabel}
        </Button>
      </div>
    </div>
  )
}
