import { useState } from 'react'
import { readStorage, writeStorage } from '@/lib/platform/storage'
import type { DriveSort, DriveViewMode } from './drive-types'

const KEY = 'anyworkflow.drive.prefs.v1'
const FIELDS = new Set(['name', 'updated', 'size'])

interface Prefs {
  view: DriveViewMode
  sort: DriveSort
}

const DEFAULTS: Prefs = { view: 'list', sort: { field: 'name', direction: 'asc' } }

function readPrefs(scope: string): Prefs {
  try {
    const all = JSON.parse(readStorage(KEY) || '{}') as Record<string, Partial<Prefs>>
    const saved = all[scope] ?? {}
    const view = saved.view === 'grid' ? 'grid' : 'list'
    const sort = saved.sort && FIELDS.has(saved.sort.field) ? { field: saved.sort.field, direction: saved.sort.direction === 'desc' ? 'desc' : 'asc' } as const : DEFAULTS.sort
    return { view, sort }
  } catch {
    return DEFAULTS
  }
}

function writePrefs(scope: string, prefs: Prefs) {
  let all: Record<string, Prefs> = {}
  try {
    all = JSON.parse(readStorage(KEY) || '{}') as Record<string, Prefs>
  } catch {
    // A corrupt value is replaced.
  }
  writeStorage(KEY, JSON.stringify({ ...all, [scope]: prefs }))
}

/** View mode and sort order of one browser, remembered per scope on this device. */
export function useDrivePrefs(scope: string) {
  const [prefs, setPrefs] = useState(() => readPrefs(scope))
  const update = (next: Partial<Prefs>) => {
    const merged = { ...prefs, ...next }
    writePrefs(scope, merged)
    setPrefs(merged)
  }
  return {
    view: prefs.view,
    sort: prefs.sort,
    setView: (view: DriveViewMode) => update({ view }),
    setSort: (sort: DriveSort) => update({ sort }),
  }
}
