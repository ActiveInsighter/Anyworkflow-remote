import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  clearEditorDraft,
  readEditorDraft,
  writeEditorDraft,
  type DraftScope,
  type EditorDraft,
} from '../lib/editor-draft'

type DraftPayload = Omit<EditorDraft, 'savedAt'>

const AUTOSAVE_MS = 450

/**
 * Local autosave for unsaved edits. Writes are debounced while dirty and flushed on `pagehide`
 * and unmount. A stored draft is only *offered* for restore; it never applies itself.
 */
export function useLocalDraft({
  scope,
  legacyScope,
  dirty,
  payload,
  autosaveDeps,
}: {
  scope: DraftScope
  legacyScope: DraftScope
  dirty: boolean
  /** Reads the latest editor state at flush time. */
  payload: () => DraftPayload
  autosaveDeps: readonly unknown[]
}) {
  const [restorable, setRestorable] = useState<EditorDraft | null>(null)
  const [legacy, setLegacy] = useState(false)
  const dirtyRef = useRef(dirty)
  const payloadRef = useRef(payload)
  dirtyRef.current = dirty
  payloadRef.current = payload

  function flush() {
    if (dirtyRef.current) writeEditorDraft(scope, payloadRef.current())
  }

  useEffect(() => {
    if (!dirty) return
    const timer = window.setTimeout(flush, AUTOSAVE_MS)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, scope, ...autosaveDeps])

  useEffect(() => {
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope])

  /** The stored draft for this scope, falling back to a legacy (backend-less) key. */
  function readCandidate() {
    const scoped = readEditorDraft(scope)
    const draft = scoped ?? readEditorDraft(legacyScope)
    const isLegacy = !scoped && Boolean(draft)
    setLegacy(isLegacy)
    return { draft, legacy: isLegacy }
  }

  /** Offer `draft` when it differs from what loaded; otherwise drop the stale copy. */
  function offerIf(draft: EditorDraft | null, differs: boolean) {
    if (draft && differs) setRestorable(draft)
    else if (draft) clearEditorDraft(scope)
  }

  /** After a successful save: nothing local is pending any more. */
  function clearAfterSave() {
    dirtyRef.current = false
    clearEditorDraft(scope)
    if (legacy && !restorable) clearEditorDraft(legacyScope)
  }

  function discard() {
    clearEditorDraft(legacy ? legacyScope : scope)
    setRestorable(null)
    toast.success('已丢弃本地草稿')
  }

  return {
    restorable,
    legacy,
    readCandidate,
    offer: setRestorable,
    offerIf,
    consume: () => setRestorable(null),
    clearAfterSave,
    discard,
  }
}
