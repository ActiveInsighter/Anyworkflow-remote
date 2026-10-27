import type * as React from 'react'
import type { LucideIcon } from 'lucide-react'

/** Colour of an entry's icon tile. Folders always use `folder`. */
export type DriveTone = 'folder' | 'neutral' | 'primary' | 'danger' | 'success' | 'warning' | 'info'

/**
 * One row of a drive-like browser: a folder (opens in place) or an item (follows `href`).
 * Features map their records to entries; the browser only lays them out.
 */
export interface DriveEntry {
  id: string
  kind: 'folder' | 'item'
  name: string
  icon?: LucideIcon
  tone?: DriveTone
  /** Secondary line under the name. */
  meta?: React.ReactNode
  /** Short status shown beside the name (a badge). */
  badge?: React.ReactNode
  /** Where an item opens. Folders ignore it. */
  href?: string
  /** Open `href` in a new tab (a file preview, not an app route). */
  external?: boolean
  /** ISO time used for sorting by modification. */
  updated: string
  /** Optional numeric size used for sorting by size. */
  size?: number
}

export type DriveSortField = 'name' | 'updated' | 'size'
export interface DriveSort {
  field: DriveSortField
  direction: 'asc' | 'desc'
}
export type DriveViewMode = 'list' | 'grid'

/** An action in an entry's action sheet. Grouped into sections separated by dividers. */
export type DriveAction =
  | {
      kind: 'run'
      id: string
      label: string
      icon: LucideIcon
      destructive?: boolean
      disabled?: boolean
      /** Runs after the sheet closes. */
      onSelect: () => void
    }
  | {
      kind: 'link'
      id: string
      label: string
      icon: LucideIcon
      href: string
      external?: boolean
      /** Download with this file name instead of opening. */
      download?: string
    }
  | {
      kind: 'page'
      id: string
      label: string
      icon: LucideIcon
      destructive?: boolean
      disabled?: boolean
      /** Title of the pushed page. */
      title: string
      /** Content of the pushed page. `close` closes the whole sheet. */
      render: (close: () => void) => React.ReactNode
    }

/** A choice under the new/create button. */
export interface DriveCreateAction {
  id: string
  label: string
  icon: LucideIcon
  onSelect: () => void
}

/** Minimal folder shape shared by every library tree. */
export interface DriveFolder {
  id: string
  name: string
  parent: string
}
