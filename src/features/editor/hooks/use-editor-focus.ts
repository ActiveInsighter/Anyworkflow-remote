import { createContext, useCallback, useContext, useMemo, useRef, type MouseEvent, type RefObject } from 'react'
import type { EditorView } from '@codemirror/view'

/**
 * Toolbar focus policy. On a phone, a tool that takes focus from the text closes the keyboard and
 * the page jumps; handing focus back reopens it and the page jumps again. So:
 *
 * - tool buttons never take focus (`keepEditorFocus` on mousedown);
 * - a pointer press anywhere on the toolbar notes whether the text had focus (`note`), because a
 *   menu takes focus while it is open and the command runs only after it closes;
 * - after a command, focus returns to the text only if it had it before, or on a desktop pointer,
 *   where focusing never moves anything; it never pulls focus out of the editor's own panels.
 */
export interface EditorFocus {
  note: () => void
  /** Whether the text had focus at the last toolbar press (or has it now). */
  hadFocus: () => boolean
  /** Put focus back in the text when the policy above allows it. */
  restore: () => void
}

const NOTE_TTL_MS = 30_000

export function useEditorFocusPolicy(viewRef: RefObject<EditorView | null>): EditorFocus {
  const noted = useRef<{ at: number; focused: boolean } | null>(null)

  const note = useCallback(() => {
    noted.current = { at: Date.now(), focused: Boolean(viewRef.current?.hasFocus) }
  }, [viewRef])

  const hadFocus = useCallback(() => {
    if (viewRef.current?.hasFocus) return true
    const last = noted.current
    return Boolean(last && last.focused && Date.now() - last.at < NOTE_TTL_MS)
  }, [viewRef])

  const restore = useCallback(() => {
    const view = viewRef.current
    if (!view || view.dom.contains(document.activeElement)) return
    const desktop = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    if (hadFocus() || desktop) view.focus()
  }, [hadFocus, viewRef])

  return useMemo(() => ({ note, hadFocus, restore }), [note, hadFocus, restore])
}

const EditorFocusContext = createContext<EditorFocus | null>(null)
export const EditorFocusProvider = EditorFocusContext.Provider

export function useEditorFocus(): EditorFocus | null {
  return useContext(EditorFocusContext)
}

/** mousedown handler for tool buttons: the click still fires, but focus stays in the text. */
export function keepEditorFocus(event: MouseEvent): void {
  event.preventDefault()
}

/**
 * Props for menu and popover content opened from the toolbar: when the text was being edited, the
 * menu does not take focus on open (popovers only) and gives it back to the text on close.
 */
export function useToolbarMenuFocus() {
  const focus = useEditorFocus()
  return useMemo(
    () => ({
      onOpenAutoFocus: (event: Event) => {
        if (focus?.hadFocus()) event.preventDefault()
      },
      onCloseAutoFocus: (event: Event) => {
        if (!focus?.hadFocus()) return
        event.preventDefault()
        focus.restore()
      },
    }),
    [focus],
  )
}
