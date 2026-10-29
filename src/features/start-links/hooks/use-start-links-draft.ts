import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { toErrorMessage } from '@/lib/api'
import {
  cleanStartLinkLabel,
  createStartLinkId,
  DEFAULT_START_LINKS,
  hasStartLinkErrors,
  sameStartLinks,
  START_LINK_LIMITS,
  validateStartLink,
  type StartLink,
  type StartLinkErrors,
} from '@/lib/domain/start-links'
import { useStartLinks } from './use-start-links'

/**
 * A working copy of the account's start links. Edits stay local until `save`; a list that
 * changes underneath (another tab or device) is adopted while nothing has been edited here.
 */
export function useStartLinksDraft() {
  const store = useStartLinks()
  const [rows, setRows] = useState<StartLink[] | null>(null)
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set())
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [focusId, setFocusId] = useState<string | null>(null)

  const current = rows ?? (store.links as StartLink[])
  const cleaned = useMemo(
    () => current.map((row) => ({ ...row, label: cleanStartLinkLabel(row.label), url: row.url.trim() })),
    [current],
  )
  const errors = useMemo(() => {
    const map = new Map<string, StartLinkErrors>()
    cleaned.forEach((row, index) => {
      const earlier = cleaned.slice(0, index)
      map.set(row.id, validateStartLink(row, earlier))
    })
    return map
  }, [cleaned])

  const invalid = [...errors.values()].some(hasStartLinkErrors)
  const dirty = rows !== null && !sameStartLinks(cleaned, store.links)
  const full = current.length >= START_LINK_LIMITS.maxLinks

  function edit(next: StartLink[]) {
    setRows(next)
  }

  return {
    rows: current,
    loading: store.status === 'loading' && !store.customized,
    loadError: store.status === 'error' ? store.error : '',
    customized: store.customized,
    saving,
    dirty,
    full,
    /** Errors to show now: after a save attempt, or once a row has been left. */
    errorsFor(id: string): StartLinkErrors {
      return submitted || touched.has(id) ? (errors.get(id) ?? {}) : {}
    },
    focusId,
    update(id: string, patch: Partial<Pick<StartLink, 'label' | 'url'>>) {
      edit(current.map((row) => (row.id === id ? { ...row, ...patch } : row)))
    },
    touch(id: string) {
      setTouched((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))
    },
    add(link?: Pick<StartLink, 'label' | 'url'>) {
      if (full) return
      const id = createStartLinkId()
      edit([...current, { id, label: link?.label ?? '', url: link?.url ?? 'https://' }])
      setFocusId(id)
    },
    remove(id: string) {
      edit(current.filter((row) => row.id !== id))
    },
    move(id: string, offset: -1 | 1) {
      const index = current.findIndex((row) => row.id === id)
      const target = index + offset
      if (index < 0 || target < 0 || target >= current.length) return
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      edit(next)
    },
    resetToDefaults() {
      edit(DEFAULT_START_LINKS.map((link) => ({ ...link })))
      setTouched(new Set())
    },
    discard() {
      setRows(null)
      setTouched(new Set())
      setSubmitted(false)
    },
    /** Returns true once saved; false when invalid or the write failed (already reported). */
    async save(): Promise<boolean> {
      setSubmitted(true)
      if (invalid || saving) return false
      setSaving(true)
      try {
        await store.save(cleaned)
        setRows(null)
        setTouched(new Set())
        setSubmitted(false)
        toast.success('快捷链接已保存')
        return true
      } catch (cause) {
        toast.error('保存失败', { description: toErrorMessage(cause) })
        return false
      } finally {
        setSaving(false)
      }
    },
  }
}

export type StartLinksDraft = ReturnType<typeof useStartLinksDraft>
